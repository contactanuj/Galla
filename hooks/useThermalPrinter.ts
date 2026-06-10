import { useCallback } from 'react';
import { Platform, Alert } from 'react-native';

export function useThermalPrinter() {
  const printReceipt = useCallback(async (orderData: {
    orderId: string; items: { name: string; quantity: number; price: number }[];
    total: number; date: string;
  }) => {
    const text = formatReceipt(orderData);
    if (Platform.OS === 'web') {
      const w = window.open('', '', 'height=400,width=300');
      if (w) { w.document.write(`<pre>${text}</pre>`); w.document.close(); w.print(); }
      return;
    }
    Alert.alert('Receipt', text);
  }, []);
  return { printReceipt };
}

function formatReceipt(d: { orderId: string; items: { name: string; quantity: number; price: number }[]; total: number; date: string }): string {
  let t = '=== GALLA ===\n';
  t += `Order: ${d.orderId}\nDate: ${d.date}\n----------------------\n`;
  for (const i of d.items) { t += `${i.name}\n  ${i.quantity} x ${i.price.toFixed(2)} = ${(i.quantity * i.price).toFixed(2)}\n`; }
  t += '----------------------\n';
  t += `TOTAL: ${d.total.toFixed(2)}\n=== Thank You ===\n`;
  return t;
}
