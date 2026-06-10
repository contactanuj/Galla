import { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, Plus, Search, Users, ChevronRight, Phone } from 'lucide-react-native';
import { useIsAdmin } from '../../../hooks/useRoleGuard';
import { getAllCustomers, type CustomerWithStats } from '../../../db/repositories/customerRepository';
import { useMoney } from '../../../lib/money';

function CustomerCard({ customer, onPress }: { customer: CustomerWithStats; onPress: () => void }) {
  const money = useMoney();
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} className="bg-white dark:bg-slate-900 mx-4 mb-3 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm flex-row items-center">
      <View className="w-10 h-10 rounded-full bg-primary-50 dark:bg-primary-900 items-center justify-center mr-3">
        <Users size={18} color="#2563eb" />
      </View>
      <View className="flex-1">
        <Text className="text-sm font-semibold text-slate-900 dark:text-slate-50">{customer.name}</Text>
        {customer.phone ? (
          <View className="flex-row items-center mt-0.5">
            <Phone size={11} color="#94a3b8" />
            <Text className="text-xs text-slate-500 dark:text-slate-400 ml-1">{customer.phone}</Text>
          </View>
        ) : null}
      </View>
      <View className="items-end mr-2">
        <Text className="text-sm font-bold text-slate-900 dark:text-slate-50">{money(customer.total_spent)}</Text>
        {customer.outstanding > 0.001
          ? <Text className="text-xs font-semibold text-amber-600">Due {money(customer.outstanding)}</Text>
          : <Text className="text-xs text-slate-400 dark:text-slate-500">{customer.order_count} {customer.order_count === 1 ? 'order' : 'orders'}</Text>}
      </View>
      <ChevronRight size={18} color="#cbd5e1" />
    </TouchableOpacity>
  );
}

export default function CustomersScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const isAdmin = useIsAdmin();
  const [customers, setCustomers] = useState<CustomerWithStats[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setCustomers(await getAllCustomers());
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = query
    ? customers.filter((c) => `${c.name} ${c.phone ?? ''} ${c.email ?? ''}`.toLowerCase().includes(query.toLowerCase()))
    : customers;

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <View className="px-4 pt-4 pb-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
        <View className="flex-row items-center mb-3">
          <TouchableOpacity onPress={() => router.back()} className="mr-2 p-1">
            <ArrowLeft size={22} color="#2563eb" />
          </TouchableOpacity>
          <Text className="text-xl font-bold text-slate-900 dark:text-slate-50 flex-1">{t('customers.title')}</Text>
          {isAdmin && (
            <TouchableOpacity onPress={() => router.push('/(app)/customers/new')} className="bg-primary-600 rounded-lg px-3 py-2 flex-row items-center active:bg-primary-700">
              <Plus size={16} color="#ffffff" />
              <Text className="text-white font-semibold text-sm ml-1">{t('common.add')}</Text>
            </TouchableOpacity>
          )}
        </View>
        <View className="flex-row items-center bg-slate-100 dark:bg-slate-800 rounded-lg px-3 py-2">
          <Search size={16} color="#94a3b8" />
          <TextInput className="flex-1 ml-2 text-slate-900 dark:text-slate-50 text-sm" placeholder={t('customers.searchPlaceholder')} value={query} onChangeText={setQuery} />
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#2563eb" /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          contentContainerClassName="pt-3 pb-6"
          renderItem={({ item }) => <CustomerCard customer={item} onPress={() => router.push(`/(app)/customers/${item.id}`)} />}
          ListEmptyComponent={
            <View className="items-center py-16 px-8">
              <Users size={40} color="#cbd5e1" />
              <Text className="text-slate-400 dark:text-slate-500 text-base mt-3">{t('customers.noCustomers')}</Text>
              <Text className="text-slate-400 dark:text-slate-500 text-xs text-center mt-1">{t('customers.noCustomersHint')}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}
