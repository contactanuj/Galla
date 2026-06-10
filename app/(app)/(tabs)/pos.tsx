import { useState, useCallback, useEffect } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, ActivityIndicator, Modal, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, useFocusEffect } from 'expo-router';
import { Mic, ScanLine, Search, User, Plus, Minus, X, ChevronRight, Layers } from 'lucide-react-native';
import { useAuthStore } from '../../../store/authStore';
import { useCartStore, cartKey } from '../../../store/cartStore';
import { useResponsiveLayout } from '../../../hooks/useResponsiveLayout';
import { useBarcodeScanner } from '../../../hooks/useBarcodeScanner';
import { useVoiceInput } from '../../../hooks/useVoiceInput';
import { searchProducts, getProductByBarcode, getProductById } from '../../../db/repositories/productRepository';
import { createOrder, type StockMovement } from '../../../db/repositories/orderRepository';
import { getAllCustomers, type CustomerWithStats } from '../../../db/repositories/customerRepository';
import type { ProductWithCategory } from '../../../db/repositories/productRepository';
import { parseProductUnits, type ProductUnit } from '../../../lib/units';
import { getVariantsByProduct, getVariantByBarcode, getVariantById, type ProductVariant } from '../../../db/repositories/variantRepository';
import { useMoney } from '../../../lib/money';
import { newId } from '../../../lib/id';

function ProductCard({ product, onAdd }: { product: ProductWithCategory; onAdd: () => void }) {
  const money = useMoney();
  return (
    <TouchableOpacity onPress={onAdd} className="bg-white dark:bg-slate-900 rounded-xl p-4 mb-2 border border-slate-200 dark:border-slate-700 shadow-sm active:bg-slate-50 flex-row items-center">
      <View className="flex-1">
        <Text className="text-sm font-semibold text-slate-900 dark:text-slate-50">{product.name}</Text>
        <Text className="text-xs text-slate-500 dark:text-slate-400 mt-1">{money(product.selling_price)} · {product.stock_quantity} {product.unit_of_measurement}</Text>
      </View>
      <View className="w-8 h-8 rounded-full bg-primary-50 items-center justify-center"><Plus size={16} color="#2563eb" /></View>
    </TouchableOpacity>
  );
}

export default function PosScreen() {
  const { t } = useTranslation();
  const { isCompact } = useResponsiveLayout();
  const router = useRouter();
  const userId = useAuthStore((state) => state.userId);
  const role = useAuthStore((state) => state.role);
  const cart = useCartStore();
  const money = useMoney();
  const [searchQuery, setSearchQuery] = useState('');
  const [products, setProducts] = useState<ProductWithCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [customer, setCustomer] = useState<CustomerWithStats | null>(null);
  const [showCustomers, setShowCustomers] = useState(false);
  const [customers, setCustomers] = useState<CustomerWithStats[]>([]);
  const [unitPicker, setUnitPicker] = useState<{ product: ProductWithCategory; variants: ProductUnit[] } | null>(null);
  const [variantPicker, setVariantPicker] = useState<{ product: ProductWithCategory; variants: ProductVariant[] } | null>(null);
  const [amountPaid, setAmountPaid] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { setManualInput, handleManualSubmit, isNative } = useBarcodeScanner();
  const { transcript, listening, startListening, stopListening, setTranscript } = useVoiceInput();

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setProducts(await searchProducts(searchQuery, role || 'cashier'));
    setLoading(false);
  }, [searchQuery, role]);

  useFocusEffect(useCallback(() => { loadProducts(); }, [loadProducts]));

  useEffect(() => {
    if (transcript) { setSearchQuery(transcript); setTranscript(''); loadProducts(); }
  }, [transcript]);

  const openCustomers = async () => { setCustomers(await getAllCustomers()); setShowCustomers(true); };

  const addProductToCart = async (product: ProductWithCategory) => {
    // Variants take precedence (own stock & price); then sellable units.
    if ((product.variant_count ?? 0) > 0) {
      const vs = await getVariantsByProduct(product.id);
      if (vs.length) { setVariantPicker({ product, variants: vs }); return; }
    }
    const units = parseProductUnits(product.units, product.selling_price, product.unit_of_measurement);
    if (units.length > 1) { setUnitPicker({ product, variants: units }); return; }
    addUnit(product, units[0]);
  };
  const addUnit = (product: ProductWithCategory, unit: ProductUnit) => {
    cart.addItem({ productId: product.id, name: product.name, sellingPrice: unit.price, quantity: 1, multiplier: 1, unitLabel: unit.name, stockFactor: unit.factor });
    setUnitPicker(null);
  };
  const addVariant = (product: ProductWithCategory, v: ProductVariant) => {
    cart.addItem({ productId: product.id, variantId: v.id, name: `${product.name} · ${v.name}`, sellingPrice: v.selling_price, quantity: 1, multiplier: 1, stockFactor: 1 });
    setVariantPicker(null);
  };

  const handleBarcode = async (barcode: string) => {
    const variant = await getVariantByBarcode(barcode);
    if (variant) {
      cart.addItem({ productId: variant.product_id, variantId: variant.id, name: `${variant.product_name} · ${variant.name}`, sellingPrice: variant.selling_price, quantity: 1, multiplier: 1, stockFactor: 1 });
      return;
    }
    const product = await getProductByBarcode(barcode, role || 'cashier');
    if (product && product.barcode_value && product.multiplier) {
      cart.addItem({ productId: product.id, name: product.name, sellingPrice: product.selling_price, quantity: 1, multiplier: product.multiplier });
    }
  };

  const total = cart.getTotal();
  const paid = customer ? (amountPaid === '' ? total : (parseFloat(amountPaid) || 0)) : total;
  const balance = Math.max(0, total - paid);

  const handleCompleteSale = async () => {
    if (cart.items.length === 0 || submitting) return; // guard against double-submit
    setSubmitting(true);
    try {
      // Aggregate the base-stock each product / variant needs for this sale.
      const need = new Map<string, number>();
      for (const item of cart.items) {
        const qty = item.quantity * item.multiplier * (item.stockFactor ?? 1);
        const key = item.variantId ? `variant:${item.variantId}` : `product:${item.productId}`;
        need.set(key, (need.get(key) ?? 0) + qty);
      }
      // Block overselling: validate every line against current stock first.
      for (const [key, qty] of need) {
        const [kind, refId] = key.split(':');
        const available = kind === 'variant'
          ? (await getVariantById(refId))?.stock_quantity ?? 0
          : (await getProductById(refId, role || 'cashier'))?.stock_quantity ?? 0;
        if (qty > available) {
          Alert.alert(t('pos.insufficientStockTitle'), t('pos.insufficientStockBody'));
          return;
        }
      }
      const movements: StockMovement[] = [...need].map(([key, qty]) => {
        const [kind, refId] = key.split(':');
        return { kind: kind as 'product' | 'variant', id: refId, qty };
      });

      const orderId = newId('order');
      const now = Math.floor(Date.now() / 1000);
      await createOrder(
        { id: orderId, user_id: userId || 'unknown', total_amount: total, amount_paid: paid, status: 'completed', customer_id: customer?.id ?? null, created_at: now },
        cart.items.map((item, idx) => ({ id: `${orderId}-item-${idx}`, order_id: orderId, product_id: item.productId, product_name: item.unitLabel ? `${item.name} (${item.unitLabel})` : item.name, quantity: item.quantity, unit_price: item.sellingPrice, multiplier: item.multiplier, created_at: now })),
        movements,
      );
      cart.clearCart();
      setCustomer(null);
      setAmountPaid('');
      router.push(`/(app)/invoice/${orderId}`);
    } catch {
      Alert.alert(t('common.error'), t('pos.saleFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      {/* Customer picker */}
      <Modal visible={showCustomers} transparent animationType="slide" onRequestClose={() => setShowCustomers(false)}>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white dark:bg-slate-900 rounded-t-3xl p-5 max-h-[70%]">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-lg font-bold text-slate-900 dark:text-slate-50">{t('customers.selectCustomer')}</Text>
              <TouchableOpacity onPress={() => setShowCustomers(false)}><X size={22} color="#64748b" /></TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => { setCustomer(null); setShowCustomers(false); }} className="flex-row items-center py-3 border-b border-slate-100 dark:border-slate-800">
              <View className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center mr-3"><User size={16} color="#64748b" /></View>
              <Text className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('customers.walkIn')}</Text>
            </TouchableOpacity>
            <FlatList
              data={customers}
              keyExtractor={(c) => c.id}
              renderItem={({ item }) => (
                <TouchableOpacity onPress={() => { setCustomer(item); setShowCustomers(false); }} className="flex-row items-center py-3 border-b border-slate-100 dark:border-slate-800">
                  <View className="w-9 h-9 rounded-full bg-primary-50 items-center justify-center mr-3"><User size={16} color="#2563eb" /></View>
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-slate-900 dark:text-slate-50">{item.name}</Text>
                    {item.phone ? <Text className="text-xs text-slate-400 dark:text-slate-500">{item.phone}</Text> : null}
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text className="text-slate-400 dark:text-slate-500 text-center py-6 text-sm">{t('customers.noCustomers')}</Text>}
            />
            <TouchableOpacity onPress={() => { setShowCustomers(false); router.push('/(app)/customers/new'); }} className="bg-primary-50 rounded-xl py-3 items-center mt-3 flex-row justify-center">
              <Plus size={16} color="#2563eb" />
              <Text className="text-primary-700 font-semibold text-sm ml-1">{t('customers.addCustomer')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Variant picker (size / colour / spec SKUs) */}
      <Modal visible={!!variantPicker} transparent animationType="fade" onRequestClose={() => setVariantPicker(null)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setVariantPicker(null)} className="flex-1 bg-black/50 justify-center items-center p-6">
          <View className="bg-white dark:bg-slate-900 rounded-2xl p-5 w-full max-w-sm max-h-[70%]">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-base font-bold text-slate-900 dark:text-slate-50">{t('variants.selectVariant')}</Text>
              <TouchableOpacity onPress={() => setVariantPicker(null)}><X size={20} color="#64748b" /></TouchableOpacity>
            </View>
            <Text className="text-sm text-slate-500 dark:text-slate-400 mb-3">{variantPicker?.product.name}</Text>
            <FlatList
              data={variantPicker?.variants ?? []}
              keyExtractor={(v) => v.id}
              renderItem={({ item: v }) => (
                <TouchableOpacity onPress={() => variantPicker && addVariant(variantPicker.product, v)} disabled={v.stock_quantity <= 0} className={`flex-row items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800 ${v.stock_quantity <= 0 ? 'opacity-40' : ''}`}>
                  <View className="flex-row items-center flex-1">
                    <Layers size={16} color="#2563eb" />
                    <View className="ml-2">
                      <Text className="text-sm font-medium text-slate-900 dark:text-slate-50">{v.name}</Text>
                      <Text className="text-[10px] text-slate-400 dark:text-slate-500">{v.stock_quantity} {t('variants.inStock')}</Text>
                    </View>
                  </View>
                  <Text className="text-sm font-bold text-slate-900 dark:text-slate-50">{money(v.selling_price)}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Unit picker (products sold in multiple units) */}
      <Modal visible={!!unitPicker} transparent animationType="fade" onRequestClose={() => setUnitPicker(null)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setUnitPicker(null)} className="flex-1 bg-black/50 justify-center items-center p-6">
          <View className="bg-white dark:bg-slate-900 rounded-2xl p-5 w-full max-w-sm">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-base font-bold text-slate-900 dark:text-slate-50">{t('pos.selectUnit')}</Text>
              <TouchableOpacity onPress={() => setUnitPicker(null)}><X size={20} color="#64748b" /></TouchableOpacity>
            </View>
            <Text className="text-sm text-slate-500 dark:text-slate-400 mb-3">{unitPicker?.product.name}</Text>
            {unitPicker?.variants.map((u, i) => (
              <TouchableOpacity key={i} onPress={() => addUnit(unitPicker.product, u)} className="flex-row items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800">
                <View className="flex-row items-center">
                  <Layers size={16} color="#2563eb" />
                  <Text className="text-sm font-medium text-slate-900 dark:text-slate-50 ml-2">{u.name}{u.factor > 1 ? ` (×${u.factor})` : ''}</Text>
                </View>
                <Text className="text-sm font-bold text-slate-900 dark:text-slate-50">{money(u.price)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <View className={`flex-1 ${isCompact ? 'flex-col' : 'flex-row'}`}>
        <View className="flex-1 p-4">
          <View className="flex-row items-center gap-2 mb-3">
            <View className="flex-1 flex-row items-center bg-white dark:bg-slate-900 rounded-lg px-3 py-2 border border-slate-200 dark:border-slate-700">
              <Search size={16} color="#94a3b8" />
              <TextInput className="flex-1 ml-2 text-slate-900 dark:text-slate-50 text-sm" placeholder={t('pos.searchPlaceholder')} value={searchQuery} onChangeText={setSearchQuery} onSubmitEditing={loadProducts} />
            </View>
            <TouchableOpacity onPress={listening ? stopListening : startListening} className={`rounded-lg px-3 py-2.5 ${listening ? 'bg-red-50' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700'}`}>
              <Mic size={18} color={listening ? '#dc2626' : '#64748b'} />
            </TouchableOpacity>
            {!isNative && (
              <View className="flex-row items-center bg-white dark:bg-slate-900 rounded-lg px-3 py-2 border border-slate-200 dark:border-slate-700">
                <ScanLine size={16} color="#94a3b8" />
                <TextInput className="text-slate-900 dark:text-slate-50 text-sm w-24 ml-1" placeholder={t('common.scan')} onChangeText={setManualInput} onSubmitEditing={() => handleManualSubmit(handleBarcode)} />
              </View>
            )}
          </View>
          {loading ? (
            <ActivityIndicator size="large" color="#2563eb" className="mt-6" />
          ) : (
            <FlatList
              data={products}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <ProductCard product={item} onAdd={() => addProductToCart(item)} />}
              ListEmptyComponent={<View className="items-center py-12"><Text className="text-slate-400 dark:text-slate-500">{t('common.noResults')}</Text></View>}
            />
          )}
        </View>

        <View className={`${isCompact ? 'bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 px-4 py-3' : 'w-96 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 p-4'}`}>
          {/* Customer selector */}
          <TouchableOpacity onPress={openCustomers} className="flex-row items-center bg-slate-50 dark:bg-slate-950 rounded-xl px-3 py-2.5 mb-3 border border-slate-200 dark:border-slate-700">
            <User size={16} color="#2563eb" />
            <Text className="flex-1 ml-2 text-sm font-medium text-slate-700 dark:text-slate-200">{customer ? customer.name : t('customers.walkIn')}</Text>
            <ChevronRight size={16} color="#94a3b8" />
          </TouchableOpacity>

          <Text className="text-lg font-bold text-slate-900 dark:text-slate-50 mb-3">{t('pos.cart')}</Text>
          {cart.items.length === 0 ? (
            <Text className="text-slate-400 dark:text-slate-500 text-center py-8">{t('pos.emptyCart')}</Text>
          ) : (
            <>
              <FlatList
                data={cart.items}
                keyExtractor={(item) => cartKey(item)}
                style={isCompact ? { maxHeight: 200 } : undefined}
                renderItem={({ item }) => (
                  <View className="flex-row items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                    <View className="flex-1 pr-2">
                      <Text className="text-sm font-medium text-slate-900 dark:text-slate-50" numberOfLines={1}>{item.name}{item.unitLabel ? ` · ${item.unitLabel}` : ''}</Text>
                      <Text className="text-xs text-slate-500 dark:text-slate-400">{money(item.sellingPrice)}</Text>
                    </View>
                    <View className="flex-row items-center gap-2">
                      <TouchableOpacity onPress={() => cart.updateQuantity(cartKey(item), item.quantity - 1)} className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 items-center justify-center">
                        <Minus size={14} color="#475569" />
                      </TouchableOpacity>
                      <Text className="text-sm font-medium text-slate-900 dark:text-slate-50 w-6 text-center">{item.quantity * item.multiplier}</Text>
                      <TouchableOpacity onPress={() => cart.updateQuantity(cartKey(item), item.quantity + 1)} className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 items-center justify-center">
                        <Plus size={14} color="#475569" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => cart.removeItem(cartKey(item))} className="ml-1 p-1">
                        <X size={16} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              />
              <View className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                <Text className="text-xl font-bold text-slate-900 dark:text-slate-50 text-right">{t('pos.total')}: {money(total)}</Text>
              </View>

              {/* Partial payment (only meaningful for a known customer) */}
              {customer && (
                <View className="mt-3 flex-row items-center gap-2">
                  <View className="flex-1">
                    <Text className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t('pos.amountPaid')}</Text>
                    <TextInput value={amountPaid} onChangeText={setAmountPaid} keyboardType="decimal-pad" placeholder={total.toFixed(2)} className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-50" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t('pos.balanceDue')}</Text>
                    <View className={`rounded-lg px-3 py-2 ${balance > 0 ? 'bg-amber-50' : 'bg-emerald-50'}`}>
                      <Text className={`text-sm font-semibold ${balance > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{money(balance)}</Text>
                    </View>
                  </View>
                </View>
              )}

              <TouchableOpacity onPress={handleCompleteSale} disabled={submitting} className={`rounded-xl py-3.5 mt-4 items-center ${submitting ? 'bg-primary-400' : 'bg-primary-600 active:bg-primary-700'}`}>
                {submitting ? <ActivityIndicator color="#ffffff" /> : <Text className="text-white font-bold text-base">{t('pos.completeSale')}</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </View>
  );
}
