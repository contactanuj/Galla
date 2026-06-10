import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Share } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { ArrowLeft, Share2, Printer, FileText } from 'lucide-react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { getOrderById, type OrderWithItems } from '../../../db/repositories/orderRepository';
import { getStoreProfile, type StoreProfile } from '../../../db/repositories/storeProfileRepository';
import { getCustomerById, type Customer } from '../../../db/repositories/customerRepository';
import { useThermalPrinter } from '../../../hooks/useThermalPrinter';
import { currencySymbol } from '../../../lib/money';
import { useCurrencyStore } from '../../../store/currencyStore';

/** Escape user-controlled text before interpolating into the invoice HTML. */
function esc(s: string | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

export default function InvoiceScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { printReceipt } = useThermalPrinter();
  const liveCurrency = useCurrencyStore((s) => s.code);
  const [order, setOrder] = useState<OrderWithItems | null>(null);
  const [store, setStore] = useState<StoreProfile | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const o = await getOrderById(id);
    setOrder(o);
    setStore(await getStoreProfile());
    if (o?.customer_id) setCustomer(await getCustomerById(o.customer_id));
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <View className="flex-1 items-center justify-center bg-slate-50 dark:bg-slate-950"><ActivityIndicator size="large" color="#2563eb" /></View>;
  if (!order) return <View className="flex-1 items-center justify-center bg-slate-50 dark:bg-slate-950"><Text className="text-slate-400 dark:text-slate-500">{t('common.noResults')}</Text></View>;

  const dateStr = new Date(order.created_at * 1000).toLocaleString();
  // Format in the currency the sale was made in (snapshot), not the current one.
  const symbol = currencySymbol(order.currency ?? liveCurrency);
  const money = (n: number | null | undefined) => `${symbol}${(n ?? 0).toFixed(2)}`;

  const buildText = () => {
    const lines: string[] = [];
    lines.push(store?.name ?? 'Invoice');
    if (store?.address) lines.push(store.address);
    if (store?.phone) lines.push(store.phone);
    if (store?.tax_id) lines.push(`Tax ID: ${store.tax_id}`);
    lines.push('--------------------------------');
    lines.push(`${t('invoice.number')}: ${order.invoice_number ?? order.id}`);
    lines.push(`${t('invoice.date')}: ${dateStr}`);
    if (customer) lines.push(`${t('invoice.customer')}: ${customer.name}${customer.phone ? ' / ' + customer.phone : ''}`);
    lines.push('--------------------------------');
    for (const it of order.items) {
      lines.push(`${it.product_name ?? it.product_id}`);
      lines.push(`   ${it.quantity * it.multiplier} x ${money(it.unit_price)} = ${money(it.quantity * it.multiplier * it.unit_price)}`);
    }
    lines.push('--------------------------------');
    lines.push(`${t('invoice.total')}: ${money(order.total_amount)}`);
    if (store?.footer_note) { lines.push(''); lines.push(store.footer_note); }
    return lines.join('\n');
  };

  const paid = order.amount_paid ?? order.total_amount;
  const balance = Math.max(0, order.total_amount - paid);

  const handleShare = async () => {
    try { await Share.share({ message: buildText() }); } catch { /* cancelled */ }
  };

  const buildHtml = () => {
    const rows = order.items.map((it) => `
      <tr>
        <td>${esc(it.product_name ?? it.product_id)}</td>
        <td style="text-align:right">${it.quantity * it.multiplier}</td>
        <td style="text-align:right">${money(it.unit_price)}</td>
        <td style="text-align:right">${money(it.quantity * it.multiplier * it.unit_price)}</td>
      </tr>`).join('');
    return `<html><head><meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        body { font-family: -apple-system, Roboto, sans-serif; color:#0f172a; padding:24px; }
        h1 { font-size:20px; margin:0; } .muted { color:#64748b; font-size:12px; }
        table { width:100%; border-collapse:collapse; margin-top:16px; font-size:13px; }
        th { text-align:left; color:#94a3b8; font-size:11px; border-bottom:1px solid #e2e8f0; padding:6px 0; }
        td { padding:6px 0; border-bottom:1px solid #f1f5f9; }
        .totals { margin-top:16px; font-size:14px; } .totals div { display:flex; justify-content:space-between; padding:2px 0; }
        .grand { font-weight:bold; font-size:16px; border-top:2px solid #0f172a; margin-top:6px; padding-top:6px; }
      </style></head><body>
      <h1>${esc(store?.name ?? 'Invoice')}</h1>
      ${store?.address ? `<div class="muted">${esc(store.address)}</div>` : ''}
      ${store?.phone ? `<div class="muted">${esc(store.phone)}</div>` : ''}
      ${store?.tax_id ? `<div class="muted">Tax ID: ${esc(store.tax_id)}</div>` : ''}
      <div style="margin-top:14px" class="muted">
        ${t('invoice.number')}: <b>${esc(order.invoice_number ?? order.id)}</b><br/>
        ${t('invoice.date')}: ${esc(dateStr)}${customer ? `<br/>${t('invoice.customer')}: ${esc(customer.name)}` : ''}
      </div>
      <table><thead><tr><th>${t('invoice.items')}</th><th style="text-align:right">${t('invoice.qty')}</th><th style="text-align:right">${t('invoice.price')}</th><th style="text-align:right">${t('invoice.amount')}</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="totals">
        <div><span>${t('invoice.total')}</span><span>${money(order.total_amount)}</span></div>
        <div><span>${t('invoice.paid')}</span><span>${money(paid)}</span></div>
        ${balance > 0 ? `<div class="grand"><span>${t('invoice.balance')}</span><span>${money(balance)}</span></div>` : ''}
      </div>
      ${store?.footer_note ? `<div class="muted" style="text-align:center;margin-top:24px">${esc(store.footer_note)}</div>` : ''}
      </body></html>`;
  };

  const handlePdf = async () => {
    try {
      const { uri } = await Print.printToFileAsync({ html: buildHtml() });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: order.invoice_number ?? 'Invoice' });
    } catch { /* cancelled / unsupported */ }
  };

  const handlePrint = () => {
    printReceipt({
      orderId: order.invoice_number ?? order.id,
      items: order.items.map((i) => ({ name: i.product_name ?? i.product_id, quantity: i.quantity * i.multiplier, price: i.unit_price })),
      total: order.total_amount,
      date: dateStr,
    });
  };

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <View className="px-4 pt-4 pb-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-2 p-1"><ArrowLeft size={22} color="#2563eb" /></TouchableOpacity>
        <Text className="text-xl font-bold text-slate-900 dark:text-slate-50 flex-1">{t('invoice.title')}</Text>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="p-4">
        <View className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-700">
          {/* Store header */}
          <Text className="text-lg font-bold text-slate-900 dark:text-slate-50">{store?.name ?? 'Store'}</Text>
          {store?.address ? <Text className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{store.address}</Text> : null}
          {store?.phone ? <Text className="text-xs text-slate-500 dark:text-slate-400">{store.phone}</Text> : null}
          {store?.tax_id ? <Text className="text-xs text-slate-500 dark:text-slate-400">Tax ID: {store.tax_id}</Text> : null}

          <View className="h-px bg-slate-200 dark:bg-slate-800 my-4" />

          <View className="flex-row justify-between mb-1">
            <Text className="text-xs text-slate-500 dark:text-slate-400">{t('invoice.number')}</Text>
            <Text className="text-xs font-semibold text-slate-900 dark:text-slate-50">{order.invoice_number ?? order.id}</Text>
          </View>
          <View className="flex-row justify-between mb-1">
            <Text className="text-xs text-slate-500 dark:text-slate-400">{t('invoice.date')}</Text>
            <Text className="text-xs font-semibold text-slate-900 dark:text-slate-50">{dateStr}</Text>
          </View>
          {customer ? (
            <View className="flex-row justify-between">
              <Text className="text-xs text-slate-500 dark:text-slate-400">{t('invoice.customer')}</Text>
              <Text className="text-xs font-semibold text-slate-900 dark:text-slate-50">{customer.name}</Text>
            </View>
          ) : null}

          <View className="h-px bg-slate-200 dark:bg-slate-800 my-4" />

          {/* Items */}
          <View className="flex-row mb-2">
            <Text className="flex-1 text-xs font-semibold text-slate-400 dark:text-slate-500">{t('invoice.items')}</Text>
            <Text className="w-12 text-right text-xs font-semibold text-slate-400 dark:text-slate-500">{t('invoice.qty')}</Text>
            <Text className="w-20 text-right text-xs font-semibold text-slate-400 dark:text-slate-500">{t('invoice.amount')}</Text>
          </View>
          {order.items.map((it) => (
            <View key={it.id} className="flex-row py-1.5 border-b border-slate-100 dark:border-slate-800">
              <Text className="flex-1 text-sm text-slate-900 dark:text-slate-50" numberOfLines={1}>{it.product_name ?? it.product_id}</Text>
              <Text className="w-12 text-right text-sm text-slate-600 dark:text-slate-300">{it.quantity * it.multiplier}</Text>
              <Text className="w-20 text-right text-sm text-slate-900 dark:text-slate-50">{money(it.quantity * it.multiplier * it.unit_price)}</Text>
            </View>
          ))}

          <View className="flex-row justify-between mt-4">
            <Text className="text-base font-bold text-slate-900 dark:text-slate-50">{t('invoice.total')}</Text>
            <Text className="text-base font-bold text-slate-900 dark:text-slate-50">{money(order.total_amount)}</Text>
          </View>
          <View className="flex-row justify-between mt-1">
            <Text className="text-sm text-slate-500 dark:text-slate-400">{t('invoice.paid')}</Text>
            <Text className="text-sm text-slate-700 dark:text-slate-200">{money(paid)}</Text>
          </View>
          {balance > 0 && (
            <View className="flex-row justify-between mt-1 pt-2 border-t border-slate-100 dark:border-slate-800">
              <Text className="text-sm font-semibold text-amber-700">{t('invoice.balance')}</Text>
              <Text className="text-sm font-bold text-amber-700">{money(balance)}</Text>
            </View>
          )}

          {store?.footer_note ? <Text className="text-xs text-slate-400 dark:text-slate-500 text-center mt-4">{store.footer_note}</Text> : null}
        </View>

        <TouchableOpacity onPress={handlePdf} className="bg-primary-600 rounded-xl py-3.5 items-center flex-row justify-center active:bg-primary-700 mt-4">
          <FileText size={18} color="#ffffff" />
          <Text className="text-white font-semibold text-sm ml-2">{t('invoice.pdf')}</Text>
        </TouchableOpacity>
        <View className="flex-row gap-3 mt-3">
          <TouchableOpacity onPress={handleShare} className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-xl py-3 items-center flex-row justify-center active:bg-slate-200">
            <Share2 size={18} color="#334155" />
            <Text className="text-slate-700 dark:text-slate-200 font-semibold text-sm ml-2">{t('invoice.share')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handlePrint} className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-xl py-3 items-center flex-row justify-center active:bg-slate-200">
            <Printer size={18} color="#334155" />
            <Text className="text-slate-700 dark:text-slate-200 font-semibold text-sm ml-2">{t('invoice.print')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
