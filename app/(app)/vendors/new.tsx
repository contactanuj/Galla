import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../../store/authStore';
import { createVendor } from '../../../db/repositories/vendorRepository';

function Field({ label, value, onChangeText, placeholder, keyboardType, multiline }: any) {
  return (
    <View className="mb-4">
      <Text className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        className={`bg-slate-100 dark:bg-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-50 text-sm border border-slate-200 dark:border-slate-700 ${multiline ? 'min-h-[80px]' : ''}`}
        placeholderTextColor="#94a3b8"
        accessibilityLabel={label}
      />
    </View>
  );
}

export default function NewVendorScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const tenantId = useAuthStore((s) => s.tenantId);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', contact_person: '', email: '', phone: '', address: '', notes: '',
  });

  const set = (key: keyof typeof form) => (val: string) => setForm((f) => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert(t('common.error'), t('vendors.nameRequired'));
      return;
    }
    setSaving(true);
    try {
      await createVendor({
        name: form.name.trim(),
        contact_person: form.contact_person.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
        tenant_id: tenantId,
        is_active: 1,
      });
      router.back();
    } catch {
      Alert.alert(t('common.error'), t('vendors.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-slate-50 dark:bg-slate-950" keyboardShouldPersistTaps="handled">
      <View className="p-4">
        <Text className="text-xl font-bold text-slate-900 dark:text-slate-50 mb-6">{t('vendors.newVendor')}</Text>

        <View className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm mb-4">
          <Text className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-4">{t('vendors.basicInfo')}</Text>
          <Field label={`${t('vendors.name')} *`} value={form.name} onChangeText={set('name')} placeholder={t('vendors.namePlaceholder')} />
          <Field label={t('vendors.contactPerson')} value={form.contact_person} onChangeText={set('contact_person')} placeholder={t('vendors.contactPlaceholder')} />
        </View>

        <View className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm mb-4">
          <Text className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-4">{t('vendors.contactInfo')}</Text>
          <Field label={t('vendors.email')} value={form.email} onChangeText={set('email')} placeholder="vendor@email.com" keyboardType="email-address" />
          <Field label={t('vendors.phone')} value={form.phone} onChangeText={set('phone')} placeholder="+91-98765-43210" keyboardType="phone-pad" />
          <Field label={t('vendors.address')} value={form.address} onChangeText={set('address')} placeholder={t('vendors.addressPlaceholder')} multiline />
        </View>

        <View className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm mb-6">
          <Field label={t('vendors.notes')} value={form.notes} onChangeText={set('notes')} placeholder={t('vendors.notesPlaceholder')} multiline />
        </View>

        <View className="flex-row gap-3">
          <TouchableOpacity onPress={() => router.back()} className="flex-1 border border-slate-300 dark:border-slate-600 rounded-xl py-3 items-center">
            <Text className="text-slate-700 dark:text-slate-200 font-semibold text-sm">{t('inventory.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            className="flex-1 bg-primary-600 rounded-xl py-3 items-center active:bg-primary-700"
          >
            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text className="text-white font-semibold text-sm">{t('inventory.save')}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}
