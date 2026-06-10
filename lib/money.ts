import { useCurrencyStore } from '../store/currencyStore';

export const CURRENCIES: Record<string, { symbol: string; name: string }> = {
  INR: { symbol: '₹', name: 'Indian Rupee' },
  USD: { symbol: '$', name: 'US Dollar' },
  EUR: { symbol: '€', name: 'Euro' },
  GBP: { symbol: '£', name: 'British Pound' },
  AED: { symbol: 'د.إ', name: 'UAE Dirham' },
  SAR: { symbol: '﷼', name: 'Saudi Riyal' },
  AUD: { symbol: 'A$', name: 'Australian Dollar' },
  CAD: { symbol: 'C$', name: 'Canadian Dollar' },
  SGD: { symbol: 'S$', name: 'Singapore Dollar' },
  JPY: { symbol: '¥', name: 'Japanese Yen' },
};

export function currencySymbol(code: string): string {
  return CURRENCIES[code]?.symbol ?? code;
}

/** Non-reactive format (for string/PDF builders). Reads the current currency. */
export function formatMoney(amount: number): string {
  const code = useCurrencyStore.getState().code;
  return `${currencySymbol(code)}${(amount ?? 0).toFixed(2)}`;
}

/** Reactive formatter hook — re-renders when the currency changes. */
export function useMoney(): (amount: number | undefined | null) => string {
  const code = useCurrencyStore((s) => s.code);
  const symbol = currencySymbol(code);
  return (amount) => `${symbol}${(amount ?? 0).toFixed(2)}`;
}
