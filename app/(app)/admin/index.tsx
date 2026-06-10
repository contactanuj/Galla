import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useIsSystemAdmin } from '../../../hooks/useRoleGuard';
import { getAllTenants, type TenantWithStats } from '../../../db/repositories/tenantRepository';
import { getAllUsers, type User } from '../../../db/repositories/userRepository';

export default function AdminPanel() {
  const router = useRouter();
  const isSystemAdmin = useIsSystemAdmin();
  const [tenants, setTenants] = useState<TenantWithStats[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    if (!isSystemAdmin) return;
    (async () => {
      setLoading(true);
      const [t, u] = await Promise.all([getAllTenants(), getAllUsers()]);
      setTenants(t); setUsers(u);
      setLoading(false);
    })();
  }, [isSystemAdmin]));

  if (!isSystemAdmin) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <Text className="text-2xl mb-3">🔒</Text>
        <Text className="text-slate-700 dark:text-slate-200 font-semibold text-base text-center">System Admin access required</Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-slate-50 dark:bg-slate-950">
      <View className="p-4">
        <View className="flex-row items-center mb-6">
          <TouchableOpacity onPress={() => router.back()} className="mr-3 p-2">
            <Text className="text-primary-600 font-medium">← Back</Text>
          </TouchableOpacity>
          <Text className="text-xl font-bold text-slate-900 dark:text-slate-50">System Administration</Text>
        </View>

        {loading ? (
          <View className="items-center py-12"><ActivityIndicator size="large" color="#2563eb" /></View>
        ) : (
          <>
            {/* Stats row */}
            <View className="flex-row gap-3 mb-6">
              <StatCard label="Tenants" value={tenants.length} active={tenants.filter(t => t.is_active).length} color="bg-blue-500" />
              <StatCard label="Users" value={users.length} active={users.filter(u => u.is_active).length} color="bg-violet-500" />
            </View>

            {/* Tenants */}
            <SectionHeader title="Tenants" onAdd={() => router.push('/(app)/admin/tenants')} />
            {tenants.slice(0, 5).map((t) => (
              <TouchableOpacity key={t.id} onPress={() => router.push('/(app)/admin/tenants')} className="bg-white dark:bg-slate-900 rounded-2xl px-4 py-3 border border-slate-200 dark:border-slate-700 mb-2 flex-row items-center shadow-sm">
                <View className={`w-2.5 h-2.5 rounded-full mr-3 ${t.is_active ? 'bg-green-500' : 'bg-slate-300'}`} />
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-slate-900 dark:text-slate-50">{t.name}</Text>
                  <Text className="text-xs text-slate-500 dark:text-slate-400">{t.plan} · {t.user_count} users</Text>
                </View>
              </TouchableOpacity>
            ))}

            {/* Users */}
            <SectionHeader title="Users" onAdd={() => router.push('/(app)/admin/users')} />
            {users.slice(0, 5).map((u) => (
              <TouchableOpacity key={u.id} onPress={() => router.push('/(app)/admin/users')} className="bg-white dark:bg-slate-900 rounded-2xl px-4 py-3 border border-slate-200 dark:border-slate-700 mb-2 flex-row items-center shadow-sm">
                <View className={`w-2.5 h-2.5 rounded-full mr-3 ${u.is_active ? 'bg-green-500' : 'bg-slate-300'}`} />
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-slate-900 dark:text-slate-50">{u.name}</Text>
                  <Text className="text-xs text-slate-500 dark:text-slate-400">{u.email} · {u.role}</Text>
                </View>
              </TouchableOpacity>
            ))}
            {users.length > 5 && (
              <TouchableOpacity onPress={() => router.push('/(app)/admin/users')} className="py-2 items-center">
                <Text className="text-primary-600 text-sm font-medium">View all {users.length} users →</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}

function StatCard({ label, value, active, color }: { label: string; value: number; active: number; color: string }) {
  return (
    <View className="flex-1 bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
      <View className={`w-8 h-8 rounded-lg ${color} items-center justify-center mb-2`}>
        <Text className="text-white font-bold text-sm">{value}</Text>
      </View>
      <Text className="text-sm font-semibold text-slate-900 dark:text-slate-50">{label}</Text>
      <Text className="text-xs text-slate-400 dark:text-slate-500">{active} active</Text>
    </View>
  );
}

function SectionHeader({ title, onAdd }: { title: string; onAdd: () => void }) {
  return (
    <View className="flex-row items-center justify-between mb-2 mt-4">
      <Text className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">{title}</Text>
      <TouchableOpacity onPress={onAdd} className="bg-primary-600 rounded-lg px-3 py-1.5">
        <Text className="text-white text-xs font-semibold">Manage</Text>
      </TouchableOpacity>
    </View>
  );
}
