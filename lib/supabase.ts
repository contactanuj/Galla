import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** True when both env vars are present — guards offline-only mode */
export const supabaseEnabled = Boolean(supabaseUrl && supabaseAnonKey);

// `createClient` throws if the URL/key are falsy, so only build a real client
// when configured. In local-only mode (no env vars) we expose a typed stub that
// is never reached — every backend call is gated behind `supabaseEnabled`.
export const supabase = supabaseEnabled
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : (null as unknown as ReturnType<typeof createClient>);
