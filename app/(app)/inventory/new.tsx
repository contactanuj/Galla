import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Image, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ImagePlus, Package } from 'lucide-react-native';
import { createProduct } from '../../../db/repositories/productRepository';
import { getAllCategories, createCategory, type Category } from '../../../db/repositories/categoryRepository';
import { getAllUnits, createUnit, type Unit } from '../../../db/repositories/unitRepository';
import { useIsAdmin } from '../../../hooks/useRoleGuard';
import { chooseImageSource, uploadImage } from '../../../lib/imageUpload';
import UnitPricingEditor from '../../../components/ui/UnitPricingEditor';
import CategoryTreePicker from '../../../components/ui/CategoryTreePicker';
import VariantEditor, { type VariantDraft } from '../../../components/ui/VariantEditor';
import { createVariant } from '../../../db/repositories/variantRepository';
import { getAllLayoutNodes, assignProductLocation, type LayoutNode } from '../../../db/repositories/layoutRepository';
import LayoutNodePicker from '../../../components/ui/LayoutNodePicker';
import { serializeProductUnits, type ProductUnit } from '../../../lib/units';
import { newId } from '../../../lib/id';

export default function NewProductScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const isAdmin = useIsAdmin();
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [name, setName] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [stockQuantity, setStockQuantity] = useState('');
  const [reorderLevel, setReorderLevel] = useState('');
  const [baseUnit, setBaseUnit] = useState<string>('');
  const [extraUnits, setExtraUnits] = useState<ProductUnit[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [layoutNodes, setLayoutNodes] = useState<LayoutNode[]>([]);
  const [locationNodeId, setLocationNodeId] = useState<string | null>(null);
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Creating products is admin-only (matches the DB role policy). Bounce
  // anyone who reaches this route without permission (e.g. a deep link).
  useEffect(() => { if (!isAdmin) router.back(); }, [isAdmin]);

  useEffect(() => {
    (async () => { setCategories(await getAllCategories()); setUnits(await getAllUnits()); setLayoutNodes(await getAllLayoutNodes()); })();
  }, []);

  const handleCreateCategory = async (catName: string): Promise<string | null> => {
    try {
      const cid = newId('cat');
      await createCategory({ id: cid, name: catName, parent_id: undefined });
      setCategories(await getAllCategories());
      return cid;
    } catch { return null; }
  };

  const [newUnit, setNewUnit] = useState('');
  const handleCreateUnit = async () => {
    const u = newUnit.trim();
    if (!u) return;
    try {
      await createUnit(u, u);
      setUnits(await getAllUnits());
      setBaseUnit(u);
      setNewUnit('');
    } catch { /* ignore */ }
  };

  const pickImage = async () => {
    const uri = await chooseImageSource();
    if (!uri) return;
    setImageUri(uri);
    const url = await uploadImage(uri, 'products');
    if (url) setImageUrl(url);
  };

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert(t('common.error'), t('inventory.productName')); return; }
    setSaving(true);
    const id = newId('prod');
    await createProduct({
      id,
      name: name.trim(),
      cost_price: isAdmin ? parseFloat(costPrice) || undefined : undefined,
      selling_price: parseFloat(sellingPrice) || 0,
      stock_quantity: parseInt(stockQuantity, 10) || 0,
      reorder_level: parseInt(reorderLevel, 10) || 0,
      unit_of_measurement: baseUnit || 'Piece',
      units: serializeProductUnits([{ name: baseUnit || 'Piece', price: parseFloat(sellingPrice) || 0, factor: 1 }, ...extraUnits]),
      category_id: categoryId || undefined,
      image_uri: imageUri,
      image_url: imageUrl,
      version: 1,
    });
    for (const v of variants) {
      if (!v.name.trim()) continue;
      await createVariant({ id: newId('var'), product_id: id, name: v.name.trim(), attributes: null, cost_price: null, selling_price: v.selling_price, stock_quantity: v.stock_quantity, reorder_level: 0, barcode: v.barcode || null });
    }
    if (locationNodeId) await assignProductLocation(id, locationNodeId);
    setSaving(false);
    router.back();
  };

  const image = imageUri ?? imageUrl;

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <View className="px-4 pt-4 pb-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-2 p-1"><ArrowLeft size={22} color="#2563eb" /></TouchableOpacity>
        <Text className="text-xl font-bold text-slate-900 dark:text-slate-50">{t('inventory.addProduct')}</Text>
      </View>
      <ScrollView className="flex-1" contentContainerClassName="p-4">
        <View className="items-center mb-5">
          <TouchableOpacity onPress={pickImage} className="w-28 h-28 rounded-2xl bg-white dark:bg-slate-900 border-2 border-dashed border-slate-300 dark:border-slate-600 items-center justify-center overflow-hidden">
            {image ? <Image source={{ uri: image }} className="w-28 h-28" resizeMode="cover" /> : <Package size={32} color="#94a3b8" />}
          </TouchableOpacity>
          <TouchableOpacity onPress={pickImage} className="flex-row items-center mt-2">
            <ImagePlus size={14} color="#2563eb" />
            <Text className="text-primary-600 dark:text-primary-300 text-xs font-medium ml-1">{image ? t('image.change') : t('image.add')}</Text>
          </TouchableOpacity>
        </View>

        <View className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
          <Text className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">{t('inventory.productName')}</Text>
          <TextInput className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 mb-4 text-slate-900 dark:text-slate-50" value={name} onChangeText={setName} />

          <Text className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">{t('inventory.sellingPrice')}</Text>
          <TextInput className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 mb-4 text-slate-900 dark:text-slate-50" value={sellingPrice} onChangeText={setSellingPrice} keyboardType="decimal-pad" />

          {isAdmin && (
            <>
              <Text className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">{t('inventory.costPrice')}</Text>
              <TextInput className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 mb-4 text-slate-900 dark:text-slate-50" value={costPrice} onChangeText={setCostPrice} keyboardType="decimal-pad" />
            </>
          )}

          <Text className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">{t('inventory.stockQuantity')}</Text>
          <TextInput className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 mb-4 text-slate-900 dark:text-slate-50" value={stockQuantity} onChangeText={setStockQuantity} keyboardType="number-pad" />

          <Text className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">{t('inventory.reorderLevel')}</Text>
          <TextInput className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 mb-4 text-slate-900 dark:text-slate-50" value={reorderLevel} onChangeText={setReorderLevel} keyboardType="number-pad" />

          <Text className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{t('units.baseUnit')} ({t('inventory.unit')})</Text>
          <View className="flex-row flex-wrap gap-2 mb-2">
            {units.map((u) => (
              <TouchableOpacity key={u.id} onPress={() => setBaseUnit(u.name)} className={`rounded-lg px-3 py-2 border ${baseUnit === u.name ? 'bg-primary-600 border-primary-600' : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600'}`}>
                <Text className={`text-sm ${baseUnit === u.name ? 'text-white' : 'text-slate-700 dark:text-slate-200'}`}>{u.name}{u.abbreviation ? ` (${u.abbreviation})` : ''}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View className="flex-row items-center gap-2 mb-4">
            <TextInput className="flex-1 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-50" value={newUnit} onChangeText={setNewUnit} placeholder={t('units.addUnit')} placeholderTextColor="#94a3b8" onSubmitEditing={handleCreateUnit} returnKeyType="done" />
            <TouchableOpacity onPress={handleCreateUnit} disabled={!newUnit.trim()} className="rounded-lg px-3 py-2 bg-primary-600"><Text className="text-white text-sm font-medium">+ {t('common.add')}</Text></TouchableOpacity>
          </View>

          <Text className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{t('units.selectUnits')}</Text>
          <Text className="text-xs text-slate-400 dark:text-slate-500 mb-2">{t('units.selectUnitsHint')}</Text>
          <View className="mb-4">
            <UnitPricingEditor configured={units} value={extraUnits} onChange={setExtraUnits} t={t} />
          </View>

          <Text className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">{t('inventory.category')}</Text>
          <View className="mb-4">
            <CategoryTreePicker categories={categories} value={categoryId} onChange={setCategoryId} noneLabel={'Uncategorized'} onCreate={handleCreateCategory} createPlaceholder={'New category'} />
          </View>

          <Text className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">{t('layout.productLocation')}</Text>
          <View className="mb-4">
            {layoutNodes.length > 0
              ? <LayoutNodePicker nodes={layoutNodes} value={locationNodeId} onChange={setLocationNodeId} noneLabel={t('layout.locationNotAssigned')} />
              : <Text className="text-xs text-slate-400 dark:text-slate-500">{t('layout.emptyTree')}</Text>}
          </View>

          <Text className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{t('variants.title')}</Text>
          <Text className="text-xs text-slate-400 dark:text-slate-500 mb-2">{t('variants.hint')}</Text>
          <View className="mb-4"><VariantEditor value={variants} onChange={setVariants} t={t} /></View>

          <TouchableOpacity onPress={handleSave} disabled={saving} className="bg-primary-600 rounded-xl py-3 items-center active:bg-primary-700">
            <Text className="text-white font-semibold">{t('inventory.save')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
