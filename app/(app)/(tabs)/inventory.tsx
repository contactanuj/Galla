import { useState, useCallback, useEffect } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Image } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, useFocusEffect } from 'expo-router';
import { Mic, Search, Plus, Package } from 'lucide-react-native';
import { useAuthStore } from '../../../store/authStore';
import { useIsAdmin } from '../../../hooks/useRoleGuard';
import { useResponsiveLayout } from '../../../hooks/useResponsiveLayout';
import { useVoiceInput } from '../../../hooks/useVoiceInput';
import { getAllProducts, searchProducts, type ProductWithCategory } from '../../../db/repositories/productRepository';
import { useMoney } from '../../../lib/money';
import RoleGate from '../../../components/ui/RoleGate';

function ProductCard({ product, onPress }: { product: ProductWithCategory; onPress: () => void }) {
  const isAdmin = useIsAdmin();
  const money = useMoney();
  const hasVariants = (product.variant_count ?? 0) > 0;
  const stock = hasVariants ? (product.variant_stock ?? 0) : product.stock_quantity;
  const isOutOfStock = stock === 0;
  const isLowStock = stock <= product.reorder_level;
  const statusColor = isOutOfStock ? 'bg-red-500' : isLowStock ? 'bg-amber-500' : 'bg-emerald-500';
  const statusText = isOutOfStock ? 'Out of Stock' : isLowStock ? 'Low Stock' : 'In Stock';
  const image = product.image_uri ?? product.image_url;

  return (
    <TouchableOpacity onPress={onPress} className="bg-white dark:bg-slate-900 rounded-xl p-3 mb-3 border border-slate-200 dark:border-slate-700 shadow-sm active:bg-slate-50 dark:active:bg-slate-800 flex-row items-center" accessibilityLabel={product.name}>
      <View className="w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-800 items-center justify-center overflow-hidden mr-3">
        {image ? <Image source={{ uri: image }} className="w-14 h-14" resizeMode="cover" /> : <Package size={22} color="#94a3b8" />}
      </View>
      <View className="flex-1">
        <Text className="text-base font-semibold text-slate-900 dark:text-slate-50 mb-0.5">{product.name}</Text>
        <Text className="text-sm text-slate-500 dark:text-slate-400 mb-1.5">{product.category_name || 'Uncategorized'}</Text>
        <View className="flex-row items-center gap-2">
          <View className={`w-2 h-2 rounded-full ${statusColor}`} />
          <Text className="text-xs text-slate-500 dark:text-slate-400">{statusText}</Text>
          <Text className="text-xs text-slate-400 dark:text-slate-500 ml-2">Stock: {stock}</Text>
          {hasVariants && <Text className="text-xs text-primary-600 dark:text-primary-300 ml-2">· {product.variant_count} variants</Text>}
        </View>
      </View>
      <View className="items-end">
        <Text className="text-base font-bold text-slate-900 dark:text-slate-50">{money(product.selling_price)}</Text>
        {isAdmin && product.cost_price !== undefined && (
          <Text className="text-xs text-slate-400 dark:text-slate-500 mt-1">Cost: {money(product.cost_price)}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function InventoryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const isAdmin = useIsAdmin();
  const { isCompact } = useResponsiveLayout();
  const role = useAuthStore((state) => state.role) || 'cashier';
  const [products, setProducts] = useState<ProductWithCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const { transcript, listening, startListening, stopListening, setTranscript } = useVoiceInput();

  const loadProducts = useCallback(async () => {
    setLoading(true);
    const data = searchQuery ? await searchProducts(searchQuery, role) : await getAllProducts(role);
    setProducts(data);
    setLoading(false);
  }, [searchQuery, role]);

  useFocusEffect(useCallback(() => { loadProducts(); }, [loadProducts]));

  useEffect(() => {
    if (transcript) {
      setSearchQuery(transcript);
      setTranscript('');
      loadProducts();
    }
  }, [transcript]);

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <View className="px-4 pt-4 pb-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
        <View className="flex-row items-center gap-2 mb-3">
          <Text className="text-xl font-bold text-slate-900 dark:text-slate-50 flex-1">{t('inventory.title')}</Text>
          <RoleGate role="admin">
            <TouchableOpacity onPress={() => router.push('/inventory/new')} className="bg-primary-600 rounded-lg px-3 py-2 active:bg-primary-700 flex-row items-center">
              <Plus size={16} color="#ffffff" />
              <Text className="text-white font-medium text-sm ml-1">{t('inventory.addProduct')}</Text>
            </TouchableOpacity>
          </RoleGate>
        </View>
        <View className="flex-row items-center gap-2">
          <View className="flex-1 flex-row items-center bg-slate-100 dark:bg-slate-800 rounded-lg px-3 py-2">
            <Search size={16} color="#94a3b8" />
            <TextInput className="flex-1 ml-2 text-slate-900 dark:text-slate-50 text-sm" placeholder={t('inventory.searchPlaceholder')} value={searchQuery} onChangeText={setSearchQuery} onSubmitEditing={loadProducts} accessibilityLabel={t('inventory.searchPlaceholder')} />
          </View>
          <TouchableOpacity onPress={listening ? stopListening : startListening} className={`rounded-lg px-3 py-2.5 ${listening ? 'bg-red-50 dark:bg-red-950' : 'bg-slate-100 dark:bg-slate-800'}`} accessibilityLabel={t('common.voice')}>
            <Mic size={18} color={listening ? '#dc2626' : '#64748b'} />
          </TouchableOpacity>
        </View>
      </View>
      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#2563eb" /></View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          contentContainerClassName="p-4"
          renderItem={({ item }) => <ProductCard product={item} onPress={() => router.push(`/inventory/${item.id}`)} />}
          ListEmptyComponent={<View className="items-center justify-center py-12"><Text className="text-slate-400 dark:text-slate-500 text-base">{t('common.noResults')}</Text></View>}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadProducts} />}
        />
      )}
    </View>
  );
}
