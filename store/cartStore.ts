import { create } from 'zustand';

export interface CartItem {
  productId: string;
  variantId?: string;     // chosen variant SKU (own stock & price)
  name: string;
  sellingPrice: number;   // price for the chosen unit
  quantity: number;
  multiplier: number;     // barcode case multiplier (expands count & price)
  unitLabel?: string;     // chosen unit name (e.g. "Box")
  stockFactor?: number;   // base stock units consumed per chosen unit (e.g. 12)
}

interface CartState {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (key: string) => void;
  updateQuantity: (key: string, quantity: number) => void;
  clearCart: () => void;
  getTotal: () => number;
  getItemCount: () => number;
}

// Cart key distinguishes the same product sold as different variants / units
export function cartKey(item: { productId: string; variantId?: string; unitLabel?: string }): string {
  return `${item.productId}::${item.variantId ?? ''}::${item.unitLabel ?? ''}`;
}

export const useCartStore = create<CartState>()((set, get) => ({
  items: [],
  addItem: (item) => {
    const { items } = get();
    const key = cartKey(item);
    const existing = items.find((i) => cartKey(i) === key);
    if (existing) {
      set({ items: items.map((i) => cartKey(i) === key ? { ...i, quantity: i.quantity + item.quantity } : i) });
    } else {
      set({ items: [...items, item] });
    }
  },
  removeItem: (key) => set({ items: get().items.filter((i) => cartKey(i) !== key) }),
  updateQuantity: (key, quantity) => {
    if (quantity <= 0) set({ items: get().items.filter((i) => cartKey(i) !== key) });
    else set({ items: get().items.map((i) => cartKey(i) === key ? { ...i, quantity } : i) });
  },
  clearCart: () => set({ items: [] }),
  getTotal: () => get().items.reduce((sum, item) => sum + item.sellingPrice * item.quantity * item.multiplier, 0),
  getItemCount: () => get().items.reduce((sum, item) => sum + item.quantity * item.multiplier, 0),
}));
