import { Tabs } from 'expo-router';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, ShoppingCart, Boxes, ClipboardList, Map, Truck, Settings as SettingsIcon } from 'lucide-react-native';
import { useResponsiveLayout } from '../../../hooks/useResponsiveLayout';
import { useAuthStore } from '../../../store/authStore';
import LanguageToggle from '../../../components/ui/LanguageToggle';

type IconType = typeof LayoutDashboard;
function tabIcon(Icon: IconType) {
  return ({ focused }: { focused: boolean }) => (
    <View className="items-center justify-center">
      <Icon size={22} color={focused ? '#2563eb' : '#94a3b8'} />
    </View>
  );
}

export default function TabsLayout() {
  const { t } = useTranslation();
  const { isCompact } = useResponsiveLayout();
  const role = useAuthStore((state) => state.role);
  // A system_admin operates across tenants via the admin panel — they must NOT
  // browse store data (it would merge every tenant). Hide ALL store tabs.
  const isSysAdmin = role === 'system_admin';
  // Cashiers run the till: POS only. Catalog/management tabs (inventory,
  // procurement, layout, vendors) are admin-only — matching the DB role policies
  // so the UI doesn't dangle actions the server will reject.
  const isCashier = role === 'cashier';
  const posHref = isSysAdmin ? null : undefined;                    // hidden only for system_admin
  const manageHref = isSysAdmin || isCashier ? null : undefined;    // admin / system_admin manage; hidden otherwise

  return (
    <View className="flex-1">
      {!isCompact && (
        <View className="flex-row items-center justify-between px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
          <Text className="text-lg font-bold text-slate-900 dark:text-slate-50">{t('appName')}</Text>
          <LanguageToggle />
        </View>
      )}
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { height: isCompact ? 64 : 0, display: isCompact ? 'flex' : 'none' },
        }}
      >
        <Tabs.Screen name="index" options={{ tabBarLabel: t('dashboard.title'), tabBarIcon: tabIcon(LayoutDashboard) }} />
        <Tabs.Screen name="pos" options={{ href: posHref, tabBarLabel: t('pos.title'), tabBarIcon: tabIcon(ShoppingCart) }} />
        <Tabs.Screen name="inventory" options={{ href: manageHref, tabBarLabel: t('inventory.title'), tabBarIcon: tabIcon(Boxes) }} />
        <Tabs.Screen name="procurement" options={{ href: manageHref, tabBarLabel: t('procurement.title'), tabBarIcon: tabIcon(ClipboardList) }} />
        <Tabs.Screen name="layout" options={{ href: manageHref, tabBarLabel: t('layout.title'), tabBarIcon: tabIcon(Map) }} />
        <Tabs.Screen name="vendors" options={{ href: manageHref, tabBarLabel: t('vendors.title'), tabBarIcon: tabIcon(Truck) }} />
        <Tabs.Screen name="settings" options={{ tabBarLabel: t('settings.title'), tabBarIcon: tabIcon(SettingsIcon) }} />
      </Tabs>
    </View>
  );
}
