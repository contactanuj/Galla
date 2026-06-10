import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark' | 'system';

interface SettingsState {
  language: string;
  setLanguage: (lang: string) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      language: 'en',
      setLanguage: (lang) => set({ language: lang }),
      theme: 'system',
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'settings-storage', storage: createJSONStorage(() => AsyncStorage) }
  )
);
