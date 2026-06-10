import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ImagePlus, Package, MapPin } from 'lucide-react-native';
import { useIsAdmin } from '../../../hooks/useRoleGuard';
import { getProductById, updateProduct, deleteProduct, adjustProductStock, getProductBarcodes, addProductBarcode, deleteProductBarcode } from '../../../db/repositories/productRepository';
import { getAllCategories, type Category } from '../../../db/repositories/categoryRepository';
import { getAllUnits, type Unit } from '../../../db/repositories/unitRepository';
import { getProductLocationPath } from '../../../db/repositories/layoutRepository';
import type { ProductWithCategory } from '../../../db/repositories/productRepository';
import { chooseImageSource, uploadImage } from '../../../lib/imageUpload';
import UnitPricingEditor from '../../../components/ui/UnitPricingEditor';
import CategoryTreePicker from '../../../components/ui/CategoryTreePicker';
import VariantEditor, { type VariantDraft } from '../../../components/ui/VariantEditor';
import { getVariantsByProduct, createVariant, updateVariant, deleteVariant, adjustVariantStock } from '../../../db/repositories/variantRepository';
import { parseProductUnits, serializeProductUnits, type ProductUnit } from '../../../lib/units';
import { useMoney } from '../../../lib/money';
import { newId } from '../../../lib/id';

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const isAdmin = useIsAdmin();
  const money = useMoney();
  const [product, setProduct] = useState<ProductWithCategory | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [editing, setEditing] = useState(false);
  const [barcodes, setBarcodes] = useState<{ id: string; barcode_value: string; multiplier: number }[]>([]);
  const [newBarcode, setNewBarcode] = useState('');
  const [newMultiplier, setNewMultiplier] = useState('1');
  const [locationPath, setLocationPath] = useState<string[]>([]);
  const [form, setForm] = useState<Partial<ProductWithCategory>>({});
  const [baseUnit, setBaseUnit] = useState<string>('');
  const [extraUnits, setExtraUnits] = useState<ProductUnit[]>([]);
  const [variantDrafts, setVariantDrafts] = useState<VariantDraft[]>([]);
  const [origVariantIds, setOrigVariantIds] = useState<string[]>([]);
  const [origVariantStock, setOrigVariantStock] = useState<Record<string, number>>({});
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => { loadProduct(); (async () => { setCategories(await getAllCategories()); setUnits(await getAllUnits()); })(); }, [id]);

  async function loadProduct() {
    const p = await getProductById(id, isAdmin ? 'admin' : 'cashier');
    setProduct(p);
    if (p) {
      setForm(p);
      const parsed = parseProductUnits(p.units, p.selling_price, p.unit_of_measurement);
      const base = parsed.find((u) => u.factor === 1) ?? parsed[0];
      setBaseUnit(base?.name ?? p.unit_of_measurement);
      setExtraUnits(parsed.filter((u) => u.factor !== 1));
      setImageUri(p.image_uri ?? null);
      setImageUrl(p.image_url ?? null);
      setBarcodes(await getProductBarcodes(id));
      setLocationPath(await getProductLocationPath(id));
      const vs = await getVariantsByProduct(id);
      setVariantDrafts(vs.map((v) => ({ id: v.id, name: v.name, selling_price: v.selling_price, stock_quantity: v.stock_quantity, barcode: v.barcode ?? '' })));
      setOrigVariantIds(vs.map((v) => v.id));
      setOrigVariantStock(Object.fromEntries(vs.map((v) => [v.id, v.stock_quantity])));
    }
  }

  const pickImage = async () => {
    const uri = await chooseImageSource();
    if (!uri) return;
    setImageUri(uri);
    const url = await uploadImage(uri, 'products');
    if (url) setImageUrl(url);
  };

  const handleSave = async () => {
    const base = baseUnit || form.unit_of_measurement || 'Piece';
    const basePrice = form.selling_price ?? product?.selling_price ?? 0;
    // Edit everything except stock; stock changes go through a relative delta so
    // they can't overwrite sales happening on other devices.
    const { stock_quantity: formStock, ...editable } = form;
    await updateProduct({
      id, ...editable,
      unit_of_measurement: base,
      units: serializeProductUnits([{ name: base, price: basePrice, factor: 1 }, ...extraUnits]),
      image_uri: imageUri, image_url: imageUrl,
    });
    const stockDelta = (formStock ?? product?.stock_quantity ?? 0) - (product?.stock_quantity ?? 0);
    if (stockDelta !== 0) await adjustProductStock(id, stockDelta);

    // Diff variants: delete removed, update existing (stock via delta), create new
    const keptIds = new Set(variantDrafts.filter((v) => v.id).map((v) => v.id!));
    for (const oid of origVariantIds) if (!keptIds.has(oid)) await deleteVariant(oid);
    for (const v of variantDrafts) {
      if (!v.name.trim()) continue;
      if (v.id) {
        await updateVariant(v.id, { name: v.name.trim(), selling_price: v.selling_price, barcode: v.barcode || null });
        const vDelta = v.stock_quantity - (origVariantStock[v.id] ?? v.stock_quantity);
        if (vDelta !== 0) await adjustVariantStock(v.id, vDelta);
      } else {
        await createVariant({ id: newId('var'), product_id: id, name: v.name.trim(), attributes: null, cost_price: null, selling_price: v.selling_price, stock_quantity: v.stock_quantity, reorder_level: 0, barcode: v.barcode || null });
      }
    }
    setEditing(false);
    loadProduct();
  };
  const handleDelete = () => {
    Alert.alert(t('inventory.delete'), t('inventory.confirmDelete'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('inventory.delete'), style: 'destructive', onPress: async () => { await deleteProduct(id); router.back(); } },
    ]);
  };
  const handleAddBarcode = async () => {
    if (!newBarcode.trim()) return;
    await addProductBarcode({ id: newId('bc'), product_id: id, barcode_value: newBarcode.trim(), multiplier: parseInt(newMultiplier, 10) || 1 });
    setNewBarcode(''); setNewMultiplier('1'); setBarcodes(await getProductBarcodes(id));
  };
  const handleDeleteBarcode = async (barcodeId: string) => { await deleteProductBarcode(barcodeId); setBarcodes(await getProductBarcodes(id)); };

  if (!product) return <View className="flex-1 items-center justify-center bg-slate-50 dark:bg-slate-950"><Text className="text-slate-400 dark:text-slate-500">{t('common.loading')}</Text></View>;

  const image = imageUri ?? imageUrl;
  const labeled = (label: string, value: React.ReactNode) => (
    <>
      <Text className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">{label}</Text>
      {value}
    </>
  );

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <View className="px-4 pt-4 pb-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-2 p-1"><ArrowLeft size={22} color="#2563eb" /></TouchableOpacity>
        <Text className="text-xl font-bold text-slate-900 dark:text-slate-50 flex-1">{t('inventory.editProduct')}</Text>
        {isAdmin && <TouchableOpacity onPress={() => setEditing(!editing)} className="bg-slate-100 dark:bg-slate-800 rounded-lg px-3 py-2 mr-2"><Text className="text-slate-700 dark:text-slate-200 font-medium text-sm">{editing ? t('common.done') : t('common.edit')}</Text></TouchableOpacity>}
        {isAdmin && <TouchableOpacity onPress={handleDelete} className="bg-rose-50 rounded-lg px-3 py-2"><Text className="text-rose-600 font-medium text-sm">{t('inventory.delete')}</Text></TouchableOpacity>}
      </View>

      <ScrollView className="flex-1" contentContainerClassName="p-4">
        {/* Image */}
        <View className="items-center mb-5">
          <TouchableOpacity onPress={editing ? pickImage : undefined} activeOpacity={editing ? 0.7 : 1} className="w-28 h-28 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 items-center justify-center overflow-hidden">
            {image ? <Image source={{ uri: image }} className="w-28 h-28" resizeMode="cover" /> : <Package size={32} color="#94a3b8" />}
          </TouchableOpacity>
          {editing && (
            <TouchableOpacity onPress={pickImage} className="flex-row items-center mt-2">
              <ImagePlus size={14} color="#2563eb" /><Text className="text-primary-600 text-xs font-medium ml-1">{image ? t('image.change') : t('image.add')}</Text>
            </TouchableOpacity>
          )}
        </View>

        <View className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm mb-4">
          {labeled(t('inventory.productName'), editing
            ? <TextInput className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 mb-4 text-slate-900 dark:text-slate-50" value={form.name || ''} onChangeText={(text) => setForm((f) => ({ ...f, name: text }))} />
            : <Text className="text-base text-slate-900 dark:text-slate-50 mb-4">{product.name}</Text>)}

          {labeled(t('inventory.sellingPrice'), editing
            ? <TextInput className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 mb-4 text-slate-900 dark:text-slate-50" value={form.selling_price?.toString() || ''} onChangeText={(text) => setForm((f) => ({ ...f, selling_price: parseFloat(text) || 0 }))} keyboardType="decimal-pad" />
            : <Text className="text-base text-slate-900 dark:text-slate-50 mb-4">{money(product.selling_price)}</Text>)}

          {isAdmin && labeled(t('inventory.costPrice'), editing
            ? <TextInput className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 mb-4 text-slate-900 dark:text-slate-50" value={form.cost_price?.toString() || ''} onChangeText={(text) => setForm((f) => ({ ...f, cost_price: parseFloat(text) || 0 }))} keyboardType="decimal-pad" />
            : <Text className="text-base text-slate-900 dark:text-slate-50 mb-4">{money(product.cost_price)}</Text>)}

          {labeled(t('inventory.stockQuantity'), editing
            ? <TextInput className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 mb-4 text-slate-900 dark:text-slate-50" value={form.stock_quantity?.toString() || ''} onChangeText={(text) => setForm((f) => ({ ...f, stock_quantity: parseInt(text, 10) || 0 }))} keyboardType="number-pad" />
            : <Text className="text-base text-slate-900 dark:text-slate-50 mb-4">{product.stock_quantity}</Text>)}

          {labeled(t('inventory.reorderLevel'), editing
            ? <TextInput className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 mb-4 text-slate-900 dark:text-slate-50" value={form.reorder_level?.toString() || ''} onChangeText={(text) => setForm((f) => ({ ...f, reorder_level: parseInt(text, 10) || 0 }))} keyboardType="number-pad" />
            : <Text className="text-base text-slate-900 dark:text-slate-50 mb-4">{product.reorder_level}</Text>)}

          {labeled(t('units.baseUnit'), editing ? (
            <View className="flex-row flex-wrap gap-2 mb-3">
              {units.map((u) => (
                <TouchableOpacity key={u.id} onPress={() => setBaseUnit(u.name)} className={`rounded-lg px-3 py-2 border ${baseUnit === u.name ? 'bg-primary-600 border-primary-600' : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600'}`}>
                  <Text className={`text-sm ${baseUnit === u.name ? 'text-white' : 'text-slate-700 dark:text-slate-200'}`}>{u.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View className="mb-4">
              <Text className="text-base text-slate-900 dark:text-slate-50">{baseUnit || product.unit_of_measurement}</Text>
              {parseProductUnits(product.units, product.selling_price, product.unit_of_measurement).filter((u) => u.factor !== 1).map((u, i) => (
                <Text key={i} className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{u.name}: {money(u.price)} (×{u.factor})</Text>
              ))}
            </View>
          ))}

          {editing && (
            <>
              <Text className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{t('units.selectUnits')}</Text>
              <Text className="text-xs text-slate-400 dark:text-slate-500 mb-2">{t('units.selectUnitsHint')}</Text>
              <View className="mb-4"><UnitPricingEditor configured={units} value={extraUnits} onChange={setExtraUnits} t={t} /></View>
            </>
          )}

          {labeled(t('inventory.category'), editing ? (
            <View className="mb-4">
              <CategoryTreePicker categories={categories} value={form.category_id ?? null} onChange={(cid) => setForm((f) => ({ ...f, category_id: cid ?? undefined }))} noneLabel={'Uncategorized'} />
            </View>
          ) : <Text className="text-base text-slate-900 dark:text-slate-50 mb-4">{product.category_name || 'Uncategorized'}</Text>)}

          {editing ? (
            <>
              <Text className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{t('variants.title')}</Text>
              <Text className="text-xs text-slate-400 dark:text-slate-500 mb-2">{t('variants.hint')}</Text>
              <View className="mb-4"><VariantEditor value={variantDrafts} onChange={setVariantDrafts} t={t} /></View>
            </>
          ) : variantDrafts.length > 0 && (
            <View className="mb-4">
              <Text className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{t('variants.title')}</Text>
              {variantDrafts.map((v, i) => (
                <Text key={i} className="text-sm text-slate-700 dark:text-slate-200">• {v.name} — {money(v.selling_price)} · {v.stock_quantity} {t('variants.inStock')}</Text>
              ))}
            </View>
          )}

          {editing && <TouchableOpacity onPress={handleSave} className="bg-primary-600 rounded-xl py-3 items-center active:bg-primary-700"><Text className="text-white font-semibold">{t('inventory.save')}</Text></TouchableOpacity>}
        </View>

        <View className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm mb-4">
          <Text className="text-base font-semibold text-slate-900 dark:text-slate-50 mb-3">{t('inventory.barcodes')}</Text>
          {barcodes.map((bc) => (
            <View key={bc.id} className="flex-row items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
              <View><Text className="text-sm text-slate-900 dark:text-slate-50">{bc.barcode_value}</Text><Text className="text-xs text-slate-500 dark:text-slate-400">{t('inventory.multiplier')}: {bc.multiplier}</Text></View>
              {isAdmin && <TouchableOpacity onPress={() => handleDeleteBarcode(bc.id)}><Text className="text-rose-500 text-xs">{t('inventory.delete')}</Text></TouchableOpacity>}
            </View>
          ))}
          {isAdmin && (
            <View className="mt-3">
              <View className="flex-row gap-2 mb-2">
                <TextInput className="flex-1 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-50" placeholder={t('inventory.barcodeValue')} value={newBarcode} onChangeText={setNewBarcode} />
                <TextInput className="w-20 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-50" placeholder={t('inventory.multiplier')} value={newMultiplier} onChangeText={setNewMultiplier} keyboardType="number-pad" />
              </View>
              <TouchableOpacity onPress={handleAddBarcode} className="bg-primary-600 rounded-lg py-2.5 items-center"><Text className="text-white font-semibold">{t('inventory.addBarcode')}</Text></TouchableOpacity>
            </View>
          )}
        </View>

        <View className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm mb-4 flex-row items-center">
          <MapPin size={18} color="#2563eb" />
          <View className="ml-3 flex-1">
            <Text className="text-xs text-slate-400 dark:text-slate-500">{t('layout.productLocation')}</Text>
            {locationPath.length > 0 ? <Text className="text-sm text-slate-700 dark:text-slate-200">{locationPath.join(' › ')}</Text> : <Text className="text-sm text-slate-400 dark:text-slate-500">{t('layout.locationNotAssigned')}</Text>}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
