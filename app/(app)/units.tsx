import { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, Plus, Ruler, Trash2 } from 'lucide-react-native';
import { getAllUnits, createUnit, deleteUnit, type Unit } from '../../db/repositories/unitRepository';

export default function UnitsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [abbr, setAbbr] = useState('');

  const load = useCallback(async () => { setLoading(true); setUnits(await getAllUnits()); setLoading(false); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleAdd = async () => {
    if (!name.trim()) { Alert.alert(t('common.error'), t('units.nameRequired')); return; }
    await createUnit(name.trim(), abbr.trim());
    setName(''); setAbbr('');
    await load();
  };

  const handleDelete = (u: Unit) => {
    Alert.alert(t('units.deleteUnit'), u.name, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: async () => { await deleteUnit(u.id); await load(); } },
    ]);
  };

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <View className="px-4 pt-4 pb-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-2 p-1"><ArrowLeft size={22} color="#2563eb" /></TouchableOpacity>
        <Text className="text-xl font-bold text-slate-900 dark:text-slate-50">{t('units.title')}</Text>
      </View>

      <View className="bg-white dark:bg-slate-900 mx-4 mt-4 rounded-2xl p-4 border border-slate-200 dark:border-slate-700">
        <View className="flex-row gap-2">
          <TextInput value={name} onChangeText={setName} placeholder={t('units.namePlaceholder')} className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-slate-50" />
          <TextInput value={abbr} onChangeText={setAbbr} placeholder={t('units.abbrPlaceholder')} className="w-24 bg-slate-100 dark:bg-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-slate-50" />
          <TouchableOpacity onPress={handleAdd} className="bg-primary-600 rounded-xl px-4 items-center justify-center active:bg-primary-700"><Plus size={20} color="#fff" /></TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#2563eb" /></View>
      ) : (
        <FlatList
          data={units}
          keyExtractor={(u) => u.id}
          contentContainerClassName="p-4"
          renderItem={({ item }) => (
            <View className="bg-white dark:bg-slate-900 rounded-xl p-3.5 border border-slate-200 dark:border-slate-700 mb-2 flex-row items-center">
              <View className="w-9 h-9 rounded-lg bg-primary-50 dark:bg-primary-900 items-center justify-center mr-3"><Ruler size={16} color="#2563eb" /></View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-slate-900 dark:text-slate-50">{item.name}</Text>
                {item.abbreviation ? <Text className="text-xs text-slate-400 dark:text-slate-500">{item.abbreviation}</Text> : null}
              </View>
              <TouchableOpacity onPress={() => handleDelete(item)} className="p-1"><Trash2 size={18} color="#e11d48" /></TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={<View className="items-center py-16"><Ruler size={36} color="#cbd5e1" /><Text className="text-slate-400 dark:text-slate-500 mt-2">{t('units.noUnits')}</Text></View>}
        />
      )}
    </View>
  );
}
