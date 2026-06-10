import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface CurrencyState {
  code: string;                 // ISO code, e.g. 'INR'
  setCurrency: (code: string) => void;
}

/**
 * Active display currency, persisted locally and hydrated from the business's
 * store profile on login. Defaults to INR.
 */
export const useCurrencyStore = create<CurrencyState>()(
  persist(
    (set) => ({
      code: 'INR',
      setCurrency: (code) => set({ code }),
    }),
    { name: 'currency-storage', storage: createJSONStorage(() => AsyncStorage) }
  )
);
