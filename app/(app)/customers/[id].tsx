import { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Modal, Share, KeyboardAvoidingView, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { ArrowLeft, Trash2, Receipt, ChevronRight, Wallet, Calendar, FileText, CheckCircle2 } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useIsAdmin } from '../../../hooks/useRoleGuard';
import FormField from '../../../components/ui/FormField';
import {
  getCustomerById, updateCustomer, deleteCustomer,
  getCustomerOrders, getCustomerSummary,
  addCustomerPayment, getCustomerPayments, settleCustomerDues, clearCustomerHistory,
  type Customer, type CustomerOrder, type CustomerPayment,
} from '../../../db/repositories/customerRepository';
import { getStoreProfile } from '../../../db/repositories/storeProfileRepository';
import { useMoney } from '../../../lib/money';

type RangeKey = 'all' | 'month' | 'days30' | 'year' | 'custom';

function rangeBounds(key: RangeKey, from?: Date | null, to?: Date | null): { from?: number; to?: number } {
  const now = new Date();
  if (key === 'all') return {};
  if (key === 'days30') return { from: Math.floor(Date.now() / 1000) - 30 * 86400 };
  if (key === 'month') return { from: Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000) };
  if (key === 'year') return { from: Math.floor(new Date(now.getFullYear(), 0, 1).getTime() / 1000) };
  // custom
  return {
    from: from ? Math.floor(new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime() / 1000) : undefined,
    to: to ? Math.floor(new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59).getTime() / 1000) : undefined,
  };
}

const EMPTY_SUMMARY = { order_count: 0, total_spent: 0, total_paid: 0, outstanding: 0 };

export default function CustomerDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const isAdmin = useIsAdmin();
  const { id } = useLocalSearchParams<{ id: string }>();
  const money = useMoney();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', notes: '' });
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [range, setRange] = useState<RangeKey>('all');
  const [customFrom, setCustomFrom] = useState<Date | null>(null);
  const [customTo, setCustomTo] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState<'from' | 'to' | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const loadHistory = useCallback(async (key: RangeKey, from?: Date | null, to?: Date | null) => {
    if (!id) return;
    const b = rangeBounds(key, from, to);
    setOrders(await getCustomerOrders(id, b.from, b.to));
    setPayments(await getCustomerPayments(id, b.from, b.to));
    setSummary(await getCustomerSummary(id, b.from, b.to));
  }, [id]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const c = await getCustomerById(id);
    if (c) {
      setCustomer(c);
      setForm({ name: c.name, phone: c.phone ?? '', email: c.email ?? '', address: c.address ?? '', notes: c.notes ?? '' });
    }
    await loadHistory(range, customFrom, customTo);
    setLoading(false);
  }, [id, loadHistory, range, customFrom, customTo]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRange = async (key: RangeKey) => { setRange(key); await loadHistory(key, customFrom, customTo); };

  const onPickDate = (which: 'from' | 'to') => (_e: unknown, d?: Date) => {
    setShowPicker(null);
    if (!d) return;
    const nf = which === 'from' ? d : customFrom;
    const nt = which === 'to' ? d : customTo;
    setCustomFrom(nf); setCustomTo(nt); setRange('custom');
    loadHistory('custom', nf, nt);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !id) return;
    setSaving(true);
    await updateCustomer(id, { name: form.name.trim(), phone: form.phone || null, email: form.email || null, address: form.address || null, notes: form.notes || null });
    setSaving(false);
    Alert.alert(t('common.success'));
  };

  const handleDelete = () => {
    if (!id) return;
    Alert.alert(t('customers.deleteCustomer'), t('customers.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: async () => { await deleteCustomer(id); router.back(); } },
    ]);
  };

  const handleRecordPayment = async () => {
    if (!id) return;
    const amt = parseFloat(paymentAmount) || 0;
    if (amt <= 0) return;
    // A standalone credit - the customer can pay without a purchase.
    await addCustomerPayment(id, amt, null);
    setShowPayment(false); setPaymentAmount('');
    await loadHistory(range, customFrom, customTo);
  };

  const handleSettleDues = () => {
    if (!id || summary.outstanding <= 0) return;
    Alert.alert(t('customers.clearDues'), `${t('customers.clearDuesConfirm')} (${money(summary.outstanding)})`, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('customers.clearDues'), onPress: async () => { await settleCustomerDues(id); await loadHistory(range, customFrom, customTo); } },
    ]);
  };

  const handleClearHistory = () => {
    if (!id) return;
    Alert.alert(t('customers.clearHistory'), t('customers.clearHistoryConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: async () => { await clearCustomerHistory(id); await loadHistory(range, customFrom, customTo); } },
    ]);
  };

  const handleStatement = async () => {
    if (!id) return;
    const [allOrders, allPays, store] = await Promise.all([getCustomerOrders(id), getCustomerPayments(id), getStoreProfile()]);
    const entries = [
      ...allOrders.map((o) => ({ date: o.created_at, label: `${t('invoice.number')} ${o.invoice_number ?? o.id}`, debit: o.total_amount, credit: o.amount_paid })),
      ...allPays.map((p) => ({ date: p.created_at, label: p.note || t('customers.payment'), debit: 0, credit: p.amount })),
    ].sort((a, b) => a.date - b.date);
    let running = 0;
    const rows = entries.map((e) => {
      running += e.debit - e.credit;
      return `<tr><td>${new Date(e.date * 1000).toLocaleDateString()}</td><td>${e.label.replace(/</g, '&lt;')}</td>
        <td style="text-align:right">${e.debit ? money(e.debit) : ''}</td>
        <td style="text-align:right">${e.credit ? money(e.credit) : ''}</td>
        <td style="text-align:right"><b>${money(running)}</b></td></tr>`;
    }).join('');
    const html = `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"/>
      <style>body{font-family:-apple-system,Roboto,sans-serif;color:#0f172a;padding:24px}h1{font-size:20px;margin:0}
      .muted{color:#64748b;font-size:12px}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}
      th{text-align:left;color:#94a3b8;font-size:11px;border-bottom:1px solid #e2e8f0;padding:6px 4px}
      td{padding:6px 4px;border-bottom:1px solid #f1f5f9}.tot{margin-top:16px;font-size:15px;font-weight:bold;text-align:right}</style></head><body>
      <h1>${(store?.name ?? 'Statement')}</h1>
      <div class="muted">${t('customers.billingHistory')} - ${customer?.name ?? ''}${customer?.phone ? ' / ' + customer.phone : ''}</div>
      <table><thead><tr><th>${t('invoice.date')}</th><th>${t('invoice.items')}</th>
        <th style="text-align:right">${t('customers.totalSpent')}</th><th style="text-align:right">${t('invoice.paid')}</th>
        <th style="text-align:right">${t('invoice.balance')}</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="tot">${t('customers.outstanding')}: ${money(running)}</div>
      ${store?.footer_note ? `<div class="muted" style="text-align:center;margin-top:24px">${store.footer_note}</div>` : ''}
      </body></html>`;
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `${customer?.name} - ${t('customers.billingHistory')}` });
      else await Share.share({ message: `${customer?.name}: ${t('customers.outstanding')} ${money(running)}` });
    } catch { /* cancelled */ }
  };

  if (loading) return <View className="flex-1 items-center justify-center bg-slate-50 dark:bg-slate-950"><ActivityIndicator size="large" color="#2563eb" /></View>;

  const RANGES: { key: RangeKey; label: string }[] = [
    { key: 'all', label: t('common.all') }, { key: 'month', label: 'This Month' },
    { key: 'days30', label: '30 Days' }, { key: 'year', label: 'This Year' }, { key: 'custom', label: t('customers.customRange') },
  ];
  const fmt = (d: Date | null) => d ? d.toLocaleDateString() : '-';

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      {/* Record payment modal */}
      <Modal visible={showPayment} transparent animationType="fade" onRequestClose={() => setShowPayment(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-black/50 justify-center items-center p-6">
          <View className="bg-white dark:bg-slate-900 rounded-2xl p-5 w-full max-w-sm">
            <Text className="text-lg font-bold text-slate-900 dark:text-slate-50 mb-1">{t('customers.recordPayment')}</Text>
            <Text className="text-xs text-slate-400 dark:text-slate-500 mb-3">{t('customers.recordPaymentHint')}</Text>
            <Text className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t('customers.outstanding')}: {money(summary.outstanding)}</Text>
            <TextInput value={paymentAmount} onChangeText={setPaymentAmount} keyboardType="decimal-pad" placeholder={t('customers.paymentAmount')} className="bg-slate-100 dark:bg-slate-800 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-slate-50 mb-4" />
            <View className="flex-row gap-3">
              <TouchableOpacity onPress={() => setShowPayment(false)} className="flex-1 border border-slate-300 dark:border-slate-600 rounded-xl py-3 items-center"><Text className="text-slate-700 dark:text-slate-200 font-medium text-sm">{t('common.cancel')}</Text></TouchableOpacity>
              <TouchableOpacity onPress={handleRecordPayment} className="flex-1 bg-primary-600 rounded-xl py-3 items-center"><Text className="text-white font-semibold text-sm">{t('common.save')}</Text></TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {showPicker && (
        <DateTimePicker value={(showPicker === 'from' ? customFrom : customTo) ?? new Date()} mode="date" onChange={onPickDate(showPicker)} />
      )}

      <View className="px-4 pt-4 pb-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-2 p-1"><ArrowLeft size={22} color="#2563eb" /></TouchableOpacity>
        <Text className="text-xl font-bold text-slate-900 dark:text-slate-50 flex-1" numberOfLines={1}>{customer?.name}</Text>
        <TouchableOpacity onPress={handleStatement} className="p-1 mr-1"><FileText size={20} color="#2563eb" /></TouchableOpacity>
        {isAdmin && <TouchableOpacity onPress={handleDelete} className="p-1"><Trash2 size={20} color="#e11d48" /></TouchableOpacity>}
      </View>

      <ScrollView className="flex-1" contentContainerClassName="p-4" keyboardShouldPersistTaps="handled">
        {/* Summary */}
        <View className="flex-row gap-3 mb-3">
          <View className="flex-1 bg-primary-600 rounded-2xl p-4">
            <Text className="text-primary-100 text-xs">{t('customers.totalSpent')}</Text>
            <Text className="text-white text-2xl font-bold mt-1">{money(summary.total_spent)}</Text>
          </View>
          <View className={`flex-1 rounded-2xl p-4 ${summary.outstanding > 0 ? 'bg-amber-500' : 'bg-emerald-600'}`}>
            <Text className="text-white/80 text-xs">{t('customers.outstanding')}</Text>
            <Text className="text-white text-2xl font-bold mt-1">{money(summary.outstanding)}</Text>
          </View>
        </View>
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-xs text-slate-500 dark:text-slate-400">{summary.order_count} {t('customers.orderCount').toLowerCase()} · {t('invoice.paid')} {money(summary.total_paid)}</Text>
          {isAdmin && (
            <View className="flex-row gap-2">
              {summary.outstanding > 0 && (
                <TouchableOpacity onPress={handleSettleDues} className="bg-emerald-50 dark:bg-emerald-950 rounded-lg px-3 py-2 flex-row items-center active:bg-emerald-100 dark:active:bg-emerald-900">
                  <CheckCircle2 size={14} color="#059669" />
                  <Text className="text-emerald-700 dark:text-emerald-300 text-xs font-semibold ml-1">{t('customers.clearDues')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setShowPayment(true)} className="bg-primary-50 dark:bg-primary-900 rounded-lg px-3 py-2 flex-row items-center active:bg-primary-100 dark:active:bg-primary-800">
                <Wallet size={14} color="#2563eb" />
                <Text className="text-primary-700 dark:text-primary-200 text-xs font-semibold ml-1">{t('customers.recordPayment')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {isAdmin && (
          <View className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 mb-4">
            <FormField label={`${t('customers.name')} *`} value={form.name} onChangeText={set('name')} />
            <FormField label={t('customers.phone')} value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
            <FormField label={t('customers.email')} value={form.email} onChangeText={set('email')} keyboardType="email-address" />
            <FormField label={t('customers.address')} value={form.address} onChangeText={set('address')} multiline />
            <FormField label={t('customers.notes')} value={form.notes} onChangeText={set('notes')} multiline />
            <TouchableOpacity onPress={handleSave} disabled={saving} className="bg-primary-600 rounded-xl py-3 items-center active:bg-primary-700">
              {saving ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold text-sm">{t('common.save')}</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* Billing history */}
        <Text className="text-base font-bold text-slate-900 dark:text-slate-50 mb-2">{t('customers.billingHistory')}</Text>
        <View className="flex-row gap-2 mb-3 flex-wrap">
          {RANGES.map((r) => (
            <TouchableOpacity key={r.key} onPress={() => onRange(r.key)} className={`px-3 py-1.5 rounded-full border ${range === r.key ? 'bg-primary-600 border-primary-600' : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600'}`}>
              <Text className={`text-xs font-medium ${range === r.key ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {range === 'custom' && (
          <View className="flex-row gap-2 mb-3">
            <TouchableOpacity onPress={() => setShowPicker('from')} className="flex-1 flex-row items-center justify-center bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg py-2">
              <Calendar size={14} color="#64748b" /><Text className="text-xs text-slate-600 dark:text-slate-300 ml-1.5">{t('common.from')}: {fmt(customFrom)}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowPicker('to')} className="flex-1 flex-row items-center justify-center bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg py-2">
              <Calendar size={14} color="#64748b" /><Text className="text-xs text-slate-600 dark:text-slate-300 ml-1.5">{t('common.to')}: {fmt(customTo)}</Text>
            </TouchableOpacity>
          </View>
        )}

        {(() => {
          const ledger = [
            ...orders.map((o) => ({ kind: 'order' as const, id: o.id, date: o.created_at, invoice: o.invoice_number, total: o.total_amount, paid: o.amount_paid })),
            ...payments.map((p) => ({ kind: 'payment' as const, id: p.id, date: p.created_at, note: p.note, amount: p.amount })),
          ].sort((a, b) => b.date - a.date);
          if (ledger.length === 0) return (
            <View className="items-center py-10"><Receipt size={32} color="#cbd5e1" /><Text className="text-slate-400 dark:text-slate-500 text-sm mt-2">{t('customers.noOrders')}</Text></View>
          );
          return ledger.map((e) => e.kind === 'order' ? (
            <TouchableOpacity key={e.id} onPress={() => router.push(`/(app)/invoice/${e.id}`)} className="bg-white dark:bg-slate-900 rounded-xl p-3.5 border border-slate-200 dark:border-slate-700 mb-2 flex-row items-center">
              <View className="w-9 h-9 rounded-lg bg-primary-50 dark:bg-primary-900 items-center justify-center mr-3"><Receipt size={16} color="#2563eb" /></View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-slate-900 dark:text-slate-50">{e.invoice ?? e.id}</Text>
                <Text className="text-xs text-slate-400 dark:text-slate-500">{new Date(e.date * 1000).toLocaleDateString()}{e.total - e.paid > 0.001 ? ` · ${t('invoice.balance')} ${money(e.total - e.paid)}` : ''}</Text>
              </View>
              <Text className="text-sm font-bold text-slate-900 dark:text-slate-50 mr-2">{money(e.total)}</Text>
              <ChevronRight size={16} color="#cbd5e1" />
            </TouchableOpacity>
          ) : (
            <View key={e.id} className="bg-white dark:bg-slate-900 rounded-xl p-3.5 border border-slate-200 dark:border-slate-700 mb-2 flex-row items-center">
              <View className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950 items-center justify-center mr-3"><Wallet size={16} color="#059669" /></View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">{t('customers.payment')}</Text>
                <Text className="text-xs text-slate-400 dark:text-slate-500">{new Date(e.date * 1000).toLocaleDateString()}{e.note ? ` · ${e.note}` : ''}</Text>
              </View>
              <Text className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mr-2">- {money(e.amount)}</Text>
            </View>
          ));
        })()}

        {isAdmin && (orders.length > 0 || payments.length > 0) && (
          <TouchableOpacity onPress={handleClearHistory} className="mt-4 bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-900 rounded-xl py-3 items-center flex-row justify-center">
            <Trash2 size={16} color="#e11d48" />
            <Text className="text-rose-600 dark:text-rose-300 font-semibold text-sm ml-2">{t('customers.clearHistory')}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}
