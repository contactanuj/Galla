import { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, useFocusEffect } from 'expo-router';
import { useIsAdmin } from '../../../hooks/useRoleGuard';
import { getAllVendors, type VendorWithProductCount } from '../../../db/repositories/vendorRepository';

function VendorCard({ vendor, onPress }: { vendor: VendorWithProductCount; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="bg-white dark:bg-slate-900 mx-4 mb-3 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm active:opacity-80"
      accessibilityLabel={`Vendor ${vendor.name}`}
    >
      <View className="flex-row items-start justify-between mb-1">
        <Text className="text-base font-semibold text-slate-900 dark:text-slate-50 flex-1 mr-2" numberOfLines={1}>{vendor.name}</Text>
        <View className="bg-primary-100 rounded-full px-2 py-0.5">
          <Text className="text-xs font-medium text-primary-700">{vendor.product_count} products</Text>
        </View>
      </View>
      {vendor.contact_person ? (
        <Text className="text-sm text-slate-600 dark:text-slate-300 mb-0.5">{vendor.contact_person}</Text>
      ) : null}
      <View className="flex-row gap-4 mt-1">
        {vendor.phone ? <Text className="text-xs text-slate-500 dark:text-slate-400">{vendor.phone}</Text> : null}
        {vendor.email ? <Text className="text-xs text-slate-500 dark:text-slate-400" numberOfLines={1}>{vendor.email}</Text> : null}
      </View>
      {vendor.address ? (
        <Text className="text-xs text-slate-400 dark:text-slate-500 mt-1" numberOfLines={1}>{vendor.address}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

export default function VendorsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const isAdmin = useIsAdmin();
  const [vendors, setVendors] = useState<VendorWithProductCount[]>([]);
  const [filtered, setFiltered] = useState<VendorWithProductCount[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);

  const loadVendors = useCallback(async () => {
    setLoading(true);
    const data = await getAllVendors();
    setVendors(data);
    setFiltered(data);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { loadVendors(); }, [loadVendors]));

  const handleSearch = (text: string) => {
    setQuery(text);
    if (!text.trim()) { setFiltered(vendors); return; }
    const q = text.toLowerCase();
    setFiltered(vendors.filter((v) =>
      v.name.toLowerCase().includes(q) ||
      (v.contact_person ?? '').toLowerCase().includes(q) ||
      (v.phone ?? '').includes(q) ||
      (v.email ?? '').toLowerCase().includes(q)
    ));
  };

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <View className="px-4 pt-4 pb-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-xl font-bold text-slate-900 dark:text-slate-50">{t('vendors.title')}</Text>
          {isAdmin && (
            <TouchableOpacity
              onPress={() => router.push('/(app)/vendors/new')}
              className="bg-primary-600 rounded-lg px-4 py-2 active:bg-primary-700"
              accessibilityLabel={t('vendors.addVendor')}
            >
              <Text className="text-white font-semibold text-sm">{t('vendors.addVendor')}</Text>
            </TouchableOpacity>
          )}
        </View>
        <TextInput
          value={query}
          onChangeText={handleSearch}
          placeholder={t('vendors.searchPlaceholder')}
          className="bg-slate-100 dark:bg-slate-800 rounded-xl px-4 py-2.5 text-slate-900 dark:text-slate-50 text-sm"
          accessibilityLabel={t('common.search')}
        />
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerClassName="pt-3 pb-6"
          refreshControl={<RefreshControl refreshing={loading} onRefresh={loadVendors} />}
          renderItem={({ item }) => (
            <VendorCard vendor={item} onPress={() => router.push(`/(app)/vendors/${item.id}`)} />
          )}
          ListEmptyComponent={
            <View className="items-center py-16">
              <Text className="text-2xl mb-3">🏪</Text>
              <Text className="text-slate-500 dark:text-slate-400 text-base font-medium mb-1">{t('vendors.noVendors')}</Text>
              {isAdmin && (
                <Text className="text-slate-400 dark:text-slate-500 text-sm text-center px-8">{t('vendors.noVendorsHint')}</Text>
              )}
            </View>
          }
        />
      )}
    </View>
  );
}
