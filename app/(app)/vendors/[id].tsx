import { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useIsAdmin } from '../../../hooks/useRoleGuard';
import {
  getVendorById, updateVendor, deleteVendor,
  getVendorProducts, type Vendor,
} from '../../../db/repositories/vendorRepository';
import { getPurchaseOrders, type PurchaseOrderWithVendor } from '../../../db/repositories/purchaseOrderRepository';

export default function VendorDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isAdmin = useIsAdmin();
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [products, setProducts] = useState<{ product_id: string; product_name: string; is_preferred: number }[]>([]);
  const [orders, setOrders] = useState<PurchaseOrderWithVendor[]>([]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', contact_person: '', email: '', phone: '', address: '', notes: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const [v, p, all] = await Promise.all([
      getVendorById(id),
      getVendorProducts(id),
      getPurchaseOrders(),
    ]);
    setVendor(v);
    setProducts(p);
    setOrders(all.filter((o) => o.vendor_id === id));
    if (v) setForm({ name: v.name, contact_person: v.contact_person ?? '', email: v.email ?? '', phone: v.phone ?? '', address: v.address ?? '', notes: v.notes ?? '' });
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const set = (key: keyof typeof form) => (val: string) => setForm((f) => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!form.name.trim()) { Alert.alert(t('common.error'), t('vendors.nameRequired')); return; }
    setSaving(true);
    await updateVendor(id, { name: form.name.trim(), contact_person: form.contact_person || null, email: form.email || null, phone: form.phone || null, address: form.address || null, notes: form.notes || null });
    await load();
    setSaving(false);
    setEditing(false);
  };

  const handleDelete = () => {
    Alert.alert(t('vendors.deleteTitle'), t('vendors.deleteConfirm'), [
      { text: t('inventory.cancel'), style: 'cancel' },
      { text: t('inventory.delete'), style: 'destructive', onPress: async () => { await deleteVendor(id); router.back(); } },
    ]);
  };

  if (loading) return <View className="flex-1 items-center justify-center bg-slate-50 dark:bg-slate-950"><ActivityIndicator size="large" color="#2563eb" /></View>;
  if (!vendor) return <View className="flex-1 items-center justify-center bg-slate-50 dark:bg-slate-950"><Text className="text-slate-500 dark:text-slate-400">{t('common.noResults')}</Text></View>;

  return (
    <ScrollView className="flex-1 bg-slate-50 dark:bg-slate-950" keyboardShouldPersistTaps="handled">
      <View className="p-4">
        <View className="flex-row items-center justify-between mb-6">
          <Text className="text-xl font-bold text-slate-900 dark:text-slate-50 flex-1 mr-2" numberOfLines={2}>{vendor.name}</Text>
          {isAdmin && !editing && (
            <TouchableOpacity onPress={() => setEditing(true)} className="bg-slate-100 dark:bg-slate-800 rounded-lg px-3 py-2">
              <Text className="text-slate-700 dark:text-slate-200 font-medium text-sm">{t('inventory.editProduct')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Contact Info Card */}
        <View className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm mb-4">
          <Text className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-4">{t('vendors.contactInfo')}</Text>
          {editing ? (
            <>
              {(['name','contact_person','email','phone','address','notes'] as const).map((key) => (
                <View key={key} className="mb-3">
                  <Text className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t(`vendors.${key === 'contact_person' ? 'contactPerson' : key}`)}</Text>
                  <TextInput value={form[key]} onChangeText={set(key)} className="bg-slate-100 dark:bg-slate-800 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-50" />
                </View>
              ))}
              <View className="flex-row gap-3 mt-2">
                <TouchableOpacity onPress={() => { setEditing(false); if (vendor) setForm({ name: vendor.name, contact_person: vendor.contact_person ?? '', email: vendor.email ?? '', phone: vendor.phone ?? '', address: vendor.address ?? '', notes: vendor.notes ?? '' }); }} className="flex-1 border border-slate-300 dark:border-slate-600 rounded-xl py-3 items-center">
                  <Text className="text-slate-700 dark:text-slate-200 font-semibold text-sm">{t('inventory.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSave} disabled={saving} className="flex-1 bg-primary-600 rounded-xl py-3 items-center">
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text className="text-white font-semibold text-sm">{t('inventory.save')}</Text>}
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              {vendor.contact_person ? <InfoRow label={t('vendors.contactPerson')} value={vendor.contact_person} /> : null}
              {vendor.phone ? <InfoRow label={t('vendors.phone')} value={vendor.phone} /> : null}
              {vendor.email ? <InfoRow label={t('vendors.email')} value={vendor.email} /> : null}
              {vendor.address ? <InfoRow label={t('vendors.address')} value={vendor.address} /> : null}
              {vendor.notes ? <InfoRow label={t('vendors.notes')} value={vendor.notes} /> : null}
            </>
          )}
        </View>

        {/* Linked Products */}
        <View className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm mb-4">
          <Text className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">{t('vendors.suppliedProducts')} ({products.length})</Text>
          {products.length === 0
            ? <Text className="text-slate-400 dark:text-slate-500 text-sm">{t('vendors.noProductsLinked')}</Text>
            : products.map((p) => (
                <View key={p.product_id} className="flex-row items-center py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                  <Text className="flex-1 text-sm text-slate-800 dark:text-slate-100">{p.product_name}</Text>
                  {p.is_preferred ? <View className="bg-primary-100 rounded-full px-2 py-0.5"><Text className="text-xs text-primary-700 font-medium">{t('vendors.preferred')}</Text></View> : null}
                </View>
              ))
          }
        </View>

        {/* Purchase Orders */}
        <View className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm mb-6">
          <Text className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">{t('procurement.title')} ({orders.length})</Text>
          {orders.length === 0
            ? <Text className="text-slate-400 dark:text-slate-500 text-sm">{t('vendors.noPOs')}</Text>
            : orders.map((o) => (
                <View key={o.id} className="flex-row items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                  <Text className="text-xs text-slate-500 dark:text-slate-400 flex-1" numberOfLines={1}>{o.id}</Text>
                  <View className={`rounded-full px-2 py-0.5 ml-2 ${o.status === 'received' ? 'bg-green-100' : 'bg-amber-100'}`}>
                    <Text className={`text-xs font-medium ${o.status === 'received' ? 'text-green-700' : 'text-amber-700'}`}>{o.status}</Text>
                  </View>
                </View>
              ))
          }
        </View>

        {isAdmin && (
          <TouchableOpacity onPress={handleDelete} className="bg-rose-50 border border-rose-200 rounded-xl py-3 items-center">
            <Text className="text-rose-600 font-semibold">{t('vendors.deleteVendor')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="mb-3">
      <Text className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-0.5">{label}</Text>
      <Text className="text-sm text-slate-900 dark:text-slate-50">{value}</Text>
    </View>
  );
}
