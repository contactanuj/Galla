import { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Image } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, Store, ImagePlus } from 'lucide-react-native';
import { getStoreProfile, upsertStoreProfile } from '../../db/repositories/storeProfileRepository';
import { chooseImageSource, uploadImage } from '../../lib/imageUpload';
import FormField from '../../components/ui/FormField';
import { CURRENCIES } from '../../lib/money';
import { useCurrencyStore } from '../../store/currencyStore';

export default function StoreProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [form, setForm] = useState({ name: '', address: '', phone: '', email: '', tax_id: '', footer_note: '' });
  const [currency, setCurrency] = useState('INR');
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    const sp = await getStoreProfile();
    if (sp) {
      setForm({ name: sp.name ?? '', address: sp.address ?? '', phone: sp.phone ?? '', email: sp.email ?? '', tax_id: sp.tax_id ?? '', footer_note: sp.footer_note ?? '' });
      setCurrency(sp.currency ?? 'INR');
      setLogoUri(sp.logo_uri ?? null);
      setLogoUrl(sp.logo_url ?? null);
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pickLogo = async () => {
    const uri = await chooseImageSource();
    if (!uri) return;
    setLogoUri(uri);
    const url = await uploadImage(uri, 'store-logos');
    if (url) setLogoUrl(url);
  };

  const handleSave = async () => {
    setSaving(true);
    await upsertStoreProfile({ ...form, currency, logo_uri: logoUri, logo_url: logoUrl });
    useCurrencyStore.getState().setCurrency(currency);
    setSaving(false);
    Alert.alert(t('common.success'), t('store.saved'));
  };

  if (loading) return <View className="flex-1 items-center justify-center bg-slate-50 dark:bg-slate-950"><ActivityIndicator size="large" color="#2563eb" /></View>;

  const logo = logoUri ?? logoUrl;

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <View className="px-4 pt-4 pb-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-2 p-1"><ArrowLeft size={22} color="#2563eb" /></TouchableOpacity>
        <Text className="text-xl font-bold text-slate-900 dark:text-slate-50">{t('store.title')}</Text>
      </View>
      <ScrollView className="flex-1" contentContainerClassName="p-4" keyboardShouldPersistTaps="handled">
        <View className="items-center mb-5">
          <TouchableOpacity onPress={pickLogo} className="w-24 h-24 rounded-2xl bg-white dark:bg-slate-900 border-2 border-dashed border-slate-300 dark:border-slate-600 items-center justify-center overflow-hidden">
            {logo ? <Image source={{ uri: logo }} className="w-24 h-24" resizeMode="cover" /> : <Store size={32} color="#94a3b8" />}
          </TouchableOpacity>
          <TouchableOpacity onPress={pickLogo} className="flex-row items-center mt-2">
            <ImagePlus size={14} color="#2563eb" />
            <Text className="text-primary-600 text-xs font-medium ml-1">{t('store.logo')}</Text>
          </TouchableOpacity>
        </View>
        <FormField label={t('store.storeName')} value={form.name} onChangeText={set('name')} />
        <FormField label={t('store.address')} value={form.address} onChangeText={set('address')} multiline />
        <FormField label={t('store.phone')} value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
        <FormField label={t('store.email')} value={form.email} onChangeText={set('email')} keyboardType="email-address" />
        <FormField label={t('store.taxId')} value={form.tax_id} onChangeText={set('tax_id')} />

        <Text className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{t('store.currency')}</Text>
        <View className="flex-row flex-wrap gap-2 mb-3">
          {Object.entries(CURRENCIES).map(([code, c]) => (
            <TouchableOpacity key={code} onPress={() => setCurrency(code)} className={`px-3 py-2 rounded-lg border ${currency === code ? 'bg-primary-600 border-primary-600' : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600'}`}>
              <Text className={`text-sm ${currency === code ? 'text-white' : 'text-slate-700 dark:text-slate-200'}`}>{c.symbol} {code}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <FormField label={t('store.footerNote')} value={form.footer_note} onChangeText={set('footer_note')} multiline />
        <TouchableOpacity onPress={handleSave} disabled={saving} className="bg-primary-600 rounded-xl py-3.5 items-center mt-2 active:bg-primary-700">
          {saving ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold text-base">{t('store.save')}</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
