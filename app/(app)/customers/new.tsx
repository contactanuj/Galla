import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { createCustomer } from '../../../db/repositories/customerRepository';
import FormField from '../../../components/ui/FormField';

export default function NewCustomerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) { Alert.alert(t('common.error'), t('customers.nameRequired')); return; }
    setSaving(true);
    await createCustomer({ name: form.name.trim(), phone: form.phone || null, email: form.email || null, address: form.address || null, notes: form.notes || null });
    setSaving(false);
    router.back();
  };

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <View className="px-4 pt-4 pb-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-2 p-1"><ArrowLeft size={22} color="#2563eb" /></TouchableOpacity>
        <Text className="text-xl font-bold text-slate-900 dark:text-slate-50">{t('customers.newCustomer')}</Text>
      </View>
      <ScrollView className="flex-1" contentContainerClassName="p-4" keyboardShouldPersistTaps="handled">
        <FormField label={`${t('customers.name')} *`} value={form.name} onChangeText={set('name')} />
        <FormField label={t('customers.phone')} value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
        <FormField label={t('customers.email')} value={form.email} onChangeText={set('email')} keyboardType="email-address" />
        <FormField label={t('customers.address')} value={form.address} onChangeText={set('address')} multiline />
        <FormField label={t('customers.notes')} value={form.notes} onChangeText={set('notes')} multiline />
        <TouchableOpacity onPress={handleSave} disabled={saving} className="bg-primary-600 rounded-xl py-3.5 items-center mt-2 active:bg-primary-700">
          {saving ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold text-base">{t('common.save')}</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
