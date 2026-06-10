import { useEffect, useRef, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { AppState, AppStateStatus, View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colorScheme } from 'nativewind';
import { initializeDatabase } from '../db/schema';
import '../i18n';
import '../global.css';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { useFrameworkReady } from '../hooks/useFrameworkReady';
import i18n from '../i18n';
import { pullLatest, processSyncQueue, subscribeRealtime } from '../services/sync/supabaseSync';
import { getStoreProfile } from '../db/repositories/storeProfileRepository';
import { useCurrencyStore } from '../store/currencyStore';

async function hydrateCurrency() {
  try { const sp = await getStoreProfile(); if (sp?.currency) useCurrencyStore.getState().setCurrency(sp.currency); } catch { /* keep default */ }
}

export default function RootLayout() {
  useFrameworkReady();
  const [dbReady, setDbReady] = useState(false);
  const router = useRouter();
  const segments = useSegments();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const restoreSession = useAuthStore((state) => state.restoreSession);
  const language = useSettingsStore((state) => state.language);
  const theme = useSettingsStore((state) => state.theme);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  // Apply the chosen theme (light / dark / follow system) to NativeWind
  useEffect(() => { colorScheme.set(theme); }, [theme]);

  useEffect(() => {
    initializeDatabase()
      .then(() => restoreSession())
      .then(() => hydrateCurrency())
      .catch(() => {})
      .finally(() => setDbReady(true));
  }, []);

  // Pull from Supabase + flush queue whenever app comes to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && next === 'active' && isAuthenticated) {
        processSyncQueue().catch(() => {});
        pullLatest().catch(() => {});
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [isAuthenticated]);

  // Initial pull after login + live subscription for multi-device updates
  useEffect(() => {
    if (!isAuthenticated) return;
    processSyncQueue().catch(() => {});
    pullLatest().then(() => hydrateCurrency()).catch(() => {});
    const unsubscribe = subscribeRealtime(() => {
      // A change landed from another device — flush our queue and pull the delta
      processSyncQueue().catch(() => {});
      pullLatest().catch(() => {});
    });
    return unsubscribe;
  }, [isAuthenticated]);

  useEffect(() => {
    if (i18n.language !== language) {
      i18n.changeLanguage(language);
    }
  }, [language]);

  useEffect(() => {
    if (!dbReady) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/');
    }
  }, [dbReady, isAuthenticated, segments]);

  if (!dbReady) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 dark:bg-slate-950 dark:bg-slate-950">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
    </>
  );
}
