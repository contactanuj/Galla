import { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, Plus, FolderTree, Trash2 } from 'lucide-react-native';
import { getAllCategories, createCategory, deleteCategory, type Category } from '../../db/repositories/categoryRepository';
import { newId } from '../../lib/id';

export default function CategoriesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);

  const load = useCallback(async () => { setLoading(true); setCategories(await getAllCategories()); setLoading(false); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const nameById = (id: string | null | undefined) => categories.find((c) => c.id === id)?.name;

  const handleAdd = async () => {
    if (!name.trim()) return;
    await createCategory({ id: newId('cat'), name: name.trim(), parent_id: parentId ?? undefined });
    setName(''); setParentId(null);
    await load();
  };

  const handleDelete = (c: Category) => {
    Alert.alert(c.name, t('categoriesMgmt.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: async () => { await deleteCategory(c.id); await load(); } },
    ]);
  };

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <View className="px-4 pt-4 pb-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-2 p-1"><ArrowLeft size={22} color="#2563eb" /></TouchableOpacity>
        <Text className="text-xl font-bold text-slate-900 dark:text-slate-50">{t('categoriesMgmt.title')}</Text>
      </View>

      <View className="bg-white dark:bg-slate-900 mx-4 mt-4 rounded-2xl p-4 border border-slate-200 dark:border-slate-700">
        <TextInput value={name} onChangeText={setName} placeholder={t('categoriesMgmt.name')} className="bg-slate-100 dark:bg-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-slate-50 mb-2" />
        <Text className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t('categoriesMgmt.parent')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
          <TouchableOpacity onPress={() => setParentId(null)} className={`px-3 py-1.5 rounded-full border mr-2 ${!parentId ? 'bg-primary-600 border-primary-600' : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600'}`}>
            <Text className={`text-xs font-medium ${!parentId ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>{t('categoriesMgmt.root')}</Text>
          </TouchableOpacity>
          {categories.map((c) => (
            <TouchableOpacity key={c.id} onPress={() => setParentId(c.id)} className={`px-3 py-1.5 rounded-full border mr-2 ${parentId === c.id ? 'bg-primary-600 border-primary-600' : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600'}`}>
              <Text className={`text-xs font-medium ${parentId === c.id ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity onPress={handleAdd} className="bg-primary-600 rounded-xl py-2.5 items-center flex-row justify-center active:bg-primary-700">
          <Plus size={16} color="#fff" /><Text className="text-white font-semibold text-sm ml-1">{t('categoriesMgmt.addCategory')}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#2563eb" /></View>
      ) : (
        <FlatList
          data={categories}
          keyExtractor={(c) => c.id}
          contentContainerClassName="p-4"
          renderItem={({ item }) => (
            <View className="bg-white dark:bg-slate-900 rounded-xl p-3.5 border border-slate-200 dark:border-slate-700 mb-2 flex-row items-center">
              <View className="w-9 h-9 rounded-lg bg-primary-50 items-center justify-center mr-3"><FolderTree size={16} color="#2563eb" /></View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-slate-900 dark:text-slate-50">{item.name}</Text>
                {item.parent_id ? <Text className="text-xs text-slate-400 dark:text-slate-500">↳ {nameById(item.parent_id)}</Text> : null}
              </View>
              <TouchableOpacity onPress={() => handleDelete(item)} className="p-1"><Trash2 size={18} color="#e11d48" /></TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={<View className="items-center py-16"><FolderTree size={36} color="#cbd5e1" /><Text className="text-slate-400 dark:text-slate-500 mt-2">{t('categoriesMgmt.noCategories')}</Text></View>}
        />
      )}
    </View>
  );
}
