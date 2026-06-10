import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase, supabaseEnabled } from './supabase';
import { getTenantId } from './tenantContext';

/**
 * Ask the user to take a photo or pick from the gallery, then return the local
 * URI (or null). On web, jumps straight to the gallery (no native chooser).
 */
export function chooseImageSource(): Promise<string | null> {
  if (Platform.OS === 'web') return pickImageFromLibrary();
  return new Promise((resolve) => {
    Alert.alert('Add Image', undefined, [
      { text: 'Take Photo', onPress: () => takePhoto().then(resolve) },
      { text: 'Choose from Gallery', onPress: () => pickImageFromLibrary().then(resolve) },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}

/** Launch the gallery and return the picked local file URI (or null if cancelled / denied). */
export async function pickImageFromLibrary(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const result = await ImagePicker.launchImageLibraryAsync({
    quality: 0.6,
    allowsEditing: true,
    aspect: [1, 1],
  });
  if (result.canceled || !result.assets?.length) return null;
  return result.assets[0].uri;
}

/** Launch the camera and return the captured local file URI (or null). */
export async function takePhoto(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;
  const result = await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: true, aspect: [1, 1] });
  if (result.canceled || !result.assets?.length) return null;
  return result.assets[0].uri;
}

/**
 * Upload a local image to the Supabase Storage `images` bucket and return its
 * public URL. Returns null when Supabase is disabled, offline, or the upload
 * fails — callers keep the local URI working on this device regardless.
 */
export async function uploadImage(localUri: string, folder: string): Promise<string | null> {
  if (!supabaseEnabled) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const resp = await fetch(localUri);
    const arrayBuffer = await resp.arrayBuffer();
    const ext = (localUri.split('.').pop()?.split('?')[0] || 'jpg').toLowerCase();
    const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    // Tenant-scoped path — storage RLS requires the first folder to be the
    // uploader's tenant id (see schema.sql storage policies).
    const tid = getTenantId() ?? 'shared';
    const path = `${tid}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('images').upload(path, arrayBuffer, { contentType, upsert: true });
    if (error) return null;
    const { data } = supabase.storage.from('images').getPublicUrl(path);
    return data.publicUrl;
  } catch {
    return null;
  }
}

/**
 * Best-effort delete of a previously uploaded image from Storage, given its
 * public URL. No-op when Supabase is disabled, offline, or the URL isn't ours.
 */
export async function deleteImage(publicUrl: string | null | undefined): Promise<void> {
  if (!supabaseEnabled || !publicUrl) return;
  try {
    const marker = '/images/';
    const idx = publicUrl.indexOf(marker);
    if (idx === -1) return;
    const path = publicUrl.slice(idx + marker.length);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await supabase.storage.from('images').remove([path]);
  } catch {
    /* ignore — orphaned object is harmless */
  }
}
