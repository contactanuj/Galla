import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useColorScheme } from 'nativewind';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../../store/authStore';
import { useIsAdmin } from '../../../hooks/useRoleGuard';
import { useResponsiveLayout } from '../../../hooks/useResponsiveLayout';
import LanguageToggle from '../../../components/ui/LanguageToggle';
import { getAllProducts } from '../../../db/repositories/productRepository';
import { getOrders } from '../../../db/repositories/orderRepository';
import { getSyncConflicts } from '../../../services/sync/syncQueue';
import { useCallback, useState } from 'react';
import { useRouter, useFocusEffect, type Href } from 'expo-router';
import { Package, TriangleAlert, TrendingUp, RefreshCw, ShoppingCart, Boxes, Users, ClipboardList, ShieldCheck } from 'lucide-react-native';

function StatCard({ title, value, color, icon, onPress }: { title: string; value: string | number; color: string; icon: React.ReactNode; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} className={`rounded-2xl p-5 flex-1 min-w-[150px] ${color}`}>
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-white text-sm font-medium opacity-90">{title}</Text>
        {icon}
      </View>
      <Text className="text-white text-2xl font-bold">{value}</Text>
    </TouchableOpacity>
  );
}

function QuickAction({ label, icon, onPress }: { label: string; icon: React.ReactNode; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} className="bg-primary-50 dark:bg-primary-900 dark:bg-slate-800 rounded-xl p-4 flex-1 min-w-[140px] items-center active:bg-primary-100 dark:active:bg-primary-800 dark:active:bg-slate-700">
      {icon}
      <Text className="text-primary-700 dark:text-primary-200 dark:text-primary-200 font-semibold text-sm mt-2">{label}</Text>
    </TouchableOpacity>
  );
}

export default function DashboardScreen() {
  const { t } = useTranslation();
  const { isCompact } = useResponsiveLayout();
  const { colorScheme } = useColorScheme();
  const accent = colorScheme === 'dark' ? '#93c5fd' : '#1d4ed8';
  const isAdmin = useIsAdmin();
  const name = useAuthStore((state) => state.name);
  const role = useAuthStore((state) => state.role);
  const router = useRouter();
  const go = (path: Href) => router.push(path);
  const [stats, setStats] = useState({ total: 0, lowStock: 0, sales: 0, conflicts: 0 });

  const isSysAdmin = role === 'system_admin';

  // Reload every time the dashboard regains focus (e.g. after a sale or edit),
  // not just on first mount.
  useFocusEffect(useCallback(() => {
    if (isSysAdmin) return;
    let active = true;
    (async () => {
      const products = await getAllProducts('admin');
      const lowStock = products.filter((p) => p.stock_quantity <= p.reorder_level);
      const orders = await getOrders(100);
      const today = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
      const todaySales = orders.filter((o) => o.created_at > today).length;
      const conflicts = await getSyncConflicts();
      if (active) setStats({ total: products.length, lowStock: lowStock.length, sales: todaySales, conflicts: conflicts.length });
    })();
    return () => { active = false; };
  }, [isSysAdmin]));

  return (
    <ScrollView className="flex-1 bg-slate-50 dark:bg-slate-950" contentContainerClassName="p-4">
      {isCompact && (
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-lg font-bold text-slate-900 dark:text-slate-50">{t('appName')}</Text>
          <LanguageToggle />
        </View>
      )}
      <Text className="text-xl font-bold text-slate-900 dark:text-slate-50 mb-1">{t('dashboard.title')}</Text>
      <Text className="text-slate-500 dark:text-slate-400 mb-6">{name} · {t(`settings.${role}`)}</Text>

      {isSysAdmin ? (
        <TouchableOpacity onPress={() => go('/(app)/admin')} className="bg-violet-600 rounded-2xl p-6 active:bg-violet-700 flex-row items-center">
          <ShieldCheck size={28} color="#ffffff" />
          <View className="ml-3">
            <Text className="text-white text-lg font-bold mb-1">{t('settings.systemAdmin')}</Text>
            <Text className="text-violet-100 text-sm">{t('settings.adminPanel')}</Text>
          </View>
        </TouchableOpacity>
      ) : (
        <>
          <View className={`flex-row gap-3 mb-4 ${isCompact ? 'flex-wrap' : ''}`}>
            <StatCard title={t('dashboard.totalProducts')} value={stats.total} color="bg-primary-600" icon={<Package size={20} color="#ffffff" />} onPress={() => go('/inventory')} />
            <StatCard title={t('dashboard.lowStock')} value={stats.lowStock} color="bg-amber-500" icon={<TriangleAlert size={20} color="#ffffff" />} onPress={() => go('/procurement')} />
            <StatCard title={t('dashboard.todaySales')} value={stats.sales} color="bg-emerald-500" icon={<TrendingUp size={20} color="#ffffff" />} onPress={() => go('/pos')} />
            {isAdmin && <StatCard title={t('dashboard.pendingSync')} value={stats.conflicts} color="bg-rose-500" icon={<RefreshCw size={20} color="#ffffff" />} onPress={() => go('/settings')} />}
          </View>

          <View className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
            <Text className="text-base font-semibold text-slate-900 dark:text-slate-50 mb-3">Quick Actions</Text>
            <View className="flex-row flex-wrap gap-3">
              <QuickAction label={t('pos.title')} icon={<ShoppingCart size={22} color={accent} />} onPress={() => go('/pos')} />
              <QuickAction label={t('inventory.title')} icon={<Boxes size={22} color={accent} />} onPress={() => go('/inventory')} />
              <QuickAction label={t('customers.title')} icon={<Users size={22} color={accent} />} onPress={() => go('/(app)/customers')} />
              <QuickAction label={t('procurement.title')} icon={<ClipboardList size={22} color={accent} />} onPress={() => go('/procurement')} />
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}
