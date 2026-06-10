import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../../store/authStore';
import { useSettingsStore, type ThemeMode } from '../../../store/settingsStore';
import LanguageToggle from '../../../components/ui/LanguageToggle';
import { useRouter, type Href } from 'expo-router';
import { useIsAdmin, useIsSystemAdmin } from '../../../hooks/useRoleGuard';
import { Users, Store, FolderTree, Ruler, ShieldCheck, LogOut, ChevronRight, Sun, Moon, SunMoon } from 'lucide-react-native';

const THEME_OPTIONS: { key: ThemeMode; Icon: typeof Sun }[] = [
  { key: 'light', Icon: Sun },
  { key: 'dark', Icon: Moon },
  { key: 'system', Icon: SunMoon },
];

function MenuRow({ icon, label, onPress, color = '#475569' }: { icon: React.ReactNode; label: string; onPress: () => void; color?: string }) {
  return (
    <TouchableOpacity onPress={onPress} className="flex-row items-center px-4 py-3.5 active:bg-slate-50 dark:active:bg-slate-800">
      {icon}
      <Text className="flex-1 ml-3 text-base text-slate-800 dark:text-slate-100" style={{ color }}>{label}</Text>
      <ChevronRight size={18} color="#cbd5e1" />
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { name, email, role, logout } = useAuthStore();
  const router = useRouter();
  const isAdmin = useIsAdmin();
  const isSystemAdmin = useIsSystemAdmin();
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const go = (p: Href) => router.push(p);

  const roleLabel: Record<string, string> = {
    admin: t('settings.admin'), cashier: t('settings.cashier'), system_admin: t('settings.systemAdmin'),
  };

  return (
    <ScrollView className="flex-1 bg-slate-50 dark:bg-slate-950">
      <View className="p-4">
        <Text className="text-xl font-bold text-slate-900 dark:text-slate-50 mb-6">{t('settings.title')}</Text>

        <View className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm mb-4">
          <Text className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{t('settings.role')}</Text>
          <Text className="text-base font-semibold text-slate-900 dark:text-slate-50 mb-4">{roleLabel[role ?? ''] ?? role}</Text>
          <Text className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{t('login.email')}</Text>
          <Text className="text-base font-semibold text-slate-900 dark:text-slate-50 mb-1">{email}</Text>
          <Text className="text-sm text-slate-500 dark:text-slate-400">{name}</Text>
        </View>

        {/* Management */}
        {isAdmin && (
          <View className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm mb-4 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
            <MenuRow icon={<Users size={20} color="#2563eb" />} label={t('customers.title')} onPress={() => go('/(app)/customers')} />
            <MenuRow icon={<Store size={20} color="#2563eb" />} label={t('store.title')} onPress={() => go('/(app)/store-profile')} />
            <MenuRow icon={<FolderTree size={20} color="#2563eb" />} label={t('categoriesMgmt.manage')} onPress={() => go('/(app)/categories')} />
            <MenuRow icon={<Ruler size={20} color="#2563eb" />} label={t('units.manage')} onPress={() => go('/(app)/units')} />
          </View>
        )}

        <View className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm mb-4">
          <Text className="text-base font-semibold text-slate-900 dark:text-slate-50 mb-3">{t('settings.theme')}</Text>
          <View className="flex-row gap-2">
            {THEME_OPTIONS.map(({ key, Icon }) => {
              const active = theme === key;
              return (
                <TouchableOpacity key={key} onPress={() => setTheme(key)} className={`flex-1 items-center py-3 rounded-xl border ${active ? 'bg-primary-600 border-primary-600' : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-700'}`}>
                  <Icon size={20} color={active ? '#ffffff' : '#64748b'} />
                  <Text className={`text-xs font-medium mt-1 ${active ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>{t(`settings.${key}`)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm mb-4">
          <Text className="text-base font-semibold text-slate-900 dark:text-slate-50 mb-3">{t('settings.language')}</Text>
          <LanguageToggle />
        </View>

        {isSystemAdmin && (
          <TouchableOpacity onPress={() => go('/(app)/admin')} className="bg-violet-50 dark:bg-violet-950 rounded-xl py-3.5 items-center border border-violet-200 dark:border-violet-900 active:bg-violet-100 dark:active:bg-violet-900 mb-4 flex-row justify-center">
            <ShieldCheck size={18} color="#7c3aed" />
            <Text className="text-violet-700 dark:text-violet-300 font-semibold text-base ml-2">{t('settings.adminPanel')}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={logout} className="bg-rose-50 dark:bg-rose-950 rounded-xl py-3.5 items-center border border-rose-200 dark:border-rose-900 active:bg-rose-100 dark:active:bg-rose-900 flex-row justify-center">
          <LogOut size={18} color="#e11d48" />
          <Text className="text-rose-600 dark:text-rose-300 font-semibold text-base ml-2">{t('settings.logout')}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
