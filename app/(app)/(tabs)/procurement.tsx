import { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Modal, Share, Alert, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from 'expo-router';
import { getLowStockProducts, getAllProducts, type ProductWithCategory } from '../../../db/repositories/productRepository';
import {
  createPurchaseOrder, getPurchaseOrders, receivePurchaseOrder,
  type PurchaseOrderItem, type PurchaseOrderWithVendor,
} from '../../../db/repositories/purchaseOrderRepository';
import { getAllVendors, type VendorWithProductCount } from '../../../db/repositories/vendorRepository';
import * as Clipboard from 'expo-clipboard';

// --- Sub-components ---

function LowStockRow({ product, selected, onToggle }: { product: ProductWithCategory; selected: boolean; onToggle: () => void }) {
  const deficit = product.reorder_level - product.stock_quantity;
  const isOut = product.stock_quantity === 0;
  return (
    <TouchableOpacity onPress={onToggle} className={`flex-row items-center py-3 px-4 border-b border-slate-100 dark:border-slate-800 ${selected ? 'bg-primary-50 dark:bg-primary-900' : isOut ? 'bg-red-50 dark:bg-red-950' : 'bg-amber-50 dark:bg-amber-950'}`}>
      <View className={`w-6 h-6 rounded border-2 items-center justify-center mr-3 ${selected ? 'border-primary-600 bg-primary-600' : 'border-slate-300 dark:border-slate-600'}`}>
        {selected && <Text className="text-white text-xs font-bold">✓</Text>}
      </View>
      <View className="flex-1">
        <Text className="text-sm font-medium text-slate-900 dark:text-slate-50">{product.name}</Text>
        <Text className="text-xs text-slate-500 dark:text-slate-400">Stock: {product.stock_quantity} · Reorder: {product.reorder_level}</Text>
      </View>
      <Text className="text-sm font-bold text-red-500">-{deficit}</Text>
    </TouchableOpacity>
  );
}

function POHistoryRow({ po, onReceive }: { po: PurchaseOrderWithVendor; onReceive: () => void }) {
  const items: PurchaseOrderItem[] = JSON.parse(po.items_json);
  const isReceived = po.status === 'received';
  return (
    <View className="bg-white dark:bg-slate-900 mx-4 mb-3 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <View className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <View className="flex-row items-center justify-between">
          <Text className="text-xs font-mono text-slate-400 dark:text-slate-500 flex-1" numberOfLines={1}>{po.id}</Text>
          <View className={`rounded-full px-2.5 py-0.5 ml-2 ${isReceived ? 'bg-green-100' : 'bg-amber-100'}`}>
            <Text className={`text-xs font-semibold ${isReceived ? 'text-green-700 dark:text-green-300' : 'text-amber-700 dark:text-amber-300'}`}>{po.status}</Text>
          </View>
        </View>
        {po.vendor_name ? (
          <View className="flex-row items-center mt-1 gap-1">
            <Text className="text-xs text-slate-500 dark:text-slate-400">Vendor:</Text>
            <Text className="text-xs font-medium text-slate-800 dark:text-slate-100">{po.vendor_name}</Text>
            {po.vendor_phone ? <Text className="text-xs text-slate-400 dark:text-slate-500">· {po.vendor_phone}</Text> : null}
          </View>
        ) : (
          <Text className="text-xs text-amber-600 mt-1">No vendor assigned</Text>
        )}
      </View>
      <View className="px-4 py-2">
        {items.slice(0, 3).map((item, i) => (
          <Text key={i} className="text-xs text-slate-600 dark:text-slate-300 py-0.5">{item.product_name} - {item.suggested_quantity} units</Text>
        ))}
        {items.length > 3 && <Text className="text-xs text-slate-400 dark:text-slate-500">+{items.length - 3} more</Text>}
      </View>
      {!isReceived && (
        <TouchableOpacity onPress={onReceive} className="bg-primary-50 dark:bg-primary-900 border-t border-primary-100 dark:border-primary-800 py-2.5 items-center active:bg-primary-100 dark:active:bg-primary-800">
          <Text className="text-primary-700 dark:text-primary-200 font-semibold text-sm">✓ Mark as Received</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// --- Vendor Picker Modal ---
function VendorPickerModal({
  visible, vendors, onSelect, onSkip, onClose,
}: {
  visible: boolean; vendors: VendorWithProductCount[];
  onSelect: (v: VendorWithProductCount) => void; onSkip: () => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View className="flex-1 bg-black/50 justify-end">
        <View className="bg-white dark:bg-slate-900 rounded-t-3xl p-6 max-h-[70%]">
          <Text className="text-lg font-bold text-slate-900 dark:text-slate-50 mb-1">{t('vendors.selectVendor')}</Text>
          <Text className="text-sm text-slate-500 dark:text-slate-400 mb-4">{t('vendors.selectVendorHint')}</Text>
          <FlatList
            data={vendors}
            keyExtractor={(v) => v.id}
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => onSelect(item)} className="flex-row items-center py-3 border-b border-slate-100 dark:border-slate-800 active:bg-slate-50 dark:active:bg-slate-800">
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-slate-900 dark:text-slate-50">{item.name}</Text>
                  {item.contact_person ? <Text className="text-xs text-slate-500 dark:text-slate-400">{item.contact_person}</Text> : null}
                </View>
                {item.phone ? <Text className="text-xs text-slate-400 dark:text-slate-500">{item.phone}</Text> : null}
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text className="text-slate-400 dark:text-slate-500 text-sm text-center py-4">{t('vendors.noVendors')}</Text>}
          />
          <TouchableOpacity onPress={onSkip} className="mt-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl items-center">
            <Text className="text-slate-600 dark:text-slate-300 font-medium text-sm">{t('vendors.skipVendor')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} className="mt-2 py-2 items-center">
            <Text className="text-slate-400 dark:text-slate-500 text-sm">{t('common.close')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// --- PO Preview Modal ---
function POPreviewModal({
  visible, poId, items, vendor, onCopy, onShare, onClose,
}: {
  visible: boolean; poId: string; items: PurchaseOrderItem[];
  vendor: VendorWithProductCount | null;
  onCopy: () => void; onShare: () => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View className="flex-1 bg-black/50 justify-center items-center p-6">
        <View className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md">
          <Text className="text-lg font-bold text-slate-900 dark:text-slate-50 text-center mb-1">{t('procurement.purchaseOrder')}</Text>
          <Text className="text-xs text-slate-400 dark:text-slate-500 text-center mb-3">{poId}</Text>
          {vendor && (
            <View className="bg-primary-50 dark:bg-primary-900 rounded-xl p-3 mb-4">
              <Text className="text-xs font-semibold text-primary-700 dark:text-primary-200 mb-0.5">Vendor: {vendor.name}</Text>
              {vendor.contact_person ? <Text className="text-xs text-primary-600 dark:text-primary-300">{vendor.contact_person}</Text> : null}
              <View className="flex-row gap-3 mt-1">
                {vendor.phone ? <Text className="text-xs text-primary-600 dark:text-primary-300">{vendor.phone}</Text> : null}
                {vendor.email ? <Text className="text-xs text-primary-600 dark:text-primary-300">{vendor.email}</Text> : null}
              </View>
            </View>
          )}
          <View className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 mb-4 bg-slate-50 dark:bg-slate-950">
            <View className="flex-row justify-between mb-2">
              <Text className="text-xs font-bold text-slate-700 dark:text-slate-200 flex-1">{t('procurement.productName')}</Text>
              <Text className="text-xs font-bold text-slate-700 dark:text-slate-200">{t('procurement.suggestedQty')}</Text>
            </View>
            {items.map((item, idx) => (
              <View key={idx} className="flex-row justify-between py-1.5 border-t border-slate-200 dark:border-slate-700">
                <Text className="text-xs text-slate-900 dark:text-slate-50 flex-1 pr-2" numberOfLines={1}>{item.product_name}</Text>
                <Text className="text-xs font-semibold text-slate-900 dark:text-slate-50">{item.suggested_quantity}</Text>
              </View>
            ))}
          </View>
          <View className="flex-row gap-3 mb-3">
            <TouchableOpacity onPress={onCopy} className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-xl py-2.5 items-center">
              <Text className="text-slate-700 dark:text-slate-200 font-medium text-sm">{t('procurement.copyToClipboard')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onShare} className="flex-1 bg-primary-600 rounded-xl py-2.5 items-center">
              <Text className="text-white font-medium text-sm">{t('procurement.share')}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={onClose}>
            <Text className="text-center text-slate-500 dark:text-slate-400 text-sm">{t('common.close')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// --- Main Screen ---

type Tab = 'lowstock' | 'orders';

export default function ProcurementScreen() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('lowstock');
  const [lowStock, setLowStock] = useState<ProductWithCategory[]>([]);
  const [allProducts, setAllProducts] = useState<ProductWithCategory[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAddProducts, setShowAddProducts] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [orders, setOrders] = useState<PurchaseOrderWithVendor[]>([]);
  const [vendors, setVendors] = useState<VendorWithProductCount[]>([]);
  const [loading, setLoading] = useState(false);
  const [showVendorPicker, setShowVendorPicker] = useState(false);
  const [showPO, setShowPO] = useState(false);
  const [poId, setPoId] = useState('');
  const [poItems, setPoItems] = useState<PurchaseOrderItem[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<VendorWithProductCount | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [stock, allOrders, allVendors, prods] = await Promise.all([
      getLowStockProducts(),
      getPurchaseOrders(),
      getAllVendors(),
      getAllProducts('admin'),
    ]);
    setLowStock(stock);
    setOrders(allOrders);
    setVendors(allVendors);
    setAllProducts(prods);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  // Step 1: user clicks Generate PO → open vendor picker
  const handleGeneratePO = () => {
    if (selected.size === 0) return;
    setShowVendorPicker(true);
  };

  // Step 2: vendor selected (or skipped) → create PO + show preview
  const proceedWithPO = async (vendor: VendorWithProductCount | null) => {
    setShowVendorPicker(false);
    setSelectedVendor(vendor);
    // Pull from the full catalog so manually-added (non-low-stock) products are included too.
    const selectedProducts = allProducts.filter((p) => selected.has(p.id));
    const items: PurchaseOrderItem[] = selectedProducts.map((p) => ({
      product_id: p.id,
      product_name: p.name,
      current_stock: p.stock_quantity,
      reorder_level: p.reorder_level,
      suggested_quantity: Math.max(1, p.reorder_level * 2 - p.stock_quantity),
    }));
    const id = await createPurchaseOrder(items, vendor?.id ?? null);
    setPoItems(items);
    setPoId(id);
    setShowPO(true);
    setSelected(new Set());
  };

  const handleReceive = async (poId: string) => {
    const po = orders.find((o) => o.id === poId);
    if (!po) return;
    Alert.alert(
      'Mark as Received',
      po.vendor_id
        ? `This will link all ${JSON.parse(po.items_json).length} products to vendor "${po.vendor_name}".`
        : 'No vendor assigned. Products will not be linked to a vendor.',
      [
        { text: t('inventory.cancel'), style: 'cancel' },
        {
          text: 'Confirm Received', onPress: async () => {
            await receivePurchaseOrder(poId);
            await loadData();
          },
        },
      ]
    );
  };

  const poText = (items: PurchaseOrderItem[], id: string, vendor: VendorWithProductCount | null): string => {
    let text = `Purchase Order: ${id}\n`;
    if (vendor) text += `Vendor: ${vendor.name}${vendor.phone ? ` | ${vendor.phone}` : ''}${vendor.email ? ` | ${vendor.email}` : ''}\n`;
    text += `---------------------\n`;
    for (const item of items) text += `${item.product_name}: ${item.suggested_quantity}\n`;
    return text;
  };

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      {/* Vendor Picker */}
      <VendorPickerModal
        visible={showVendorPicker}
        vendors={vendors}
        onSelect={(v) => proceedWithPO(v)}
        onSkip={() => proceedWithPO(null)}
        onClose={() => setShowVendorPicker(false)}
      />

      {/* Add products to the refill order */}
      <Modal visible={showAddProducts} transparent animationType="slide" onRequestClose={() => setShowAddProducts(false)}>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white dark:bg-slate-900 rounded-t-3xl p-6 max-h-[80%]">
            <Text className="text-lg font-bold text-slate-900 dark:text-slate-50 mb-1">{t('procurement.addProducts')}</Text>
            <Text className="text-sm text-slate-500 dark:text-slate-400 mb-3">{t('procurement.addProductsHint')}</Text>
            <TextInput value={addSearch} onChangeText={setAddSearch} placeholder={t('inventory.searchPlaceholder')} placeholderTextColor="#94a3b8" className="bg-slate-100 dark:bg-slate-800 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-slate-50 mb-3" />
            <FlatList
              data={allProducts.filter((p) => p.name.toLowerCase().includes(addSearch.toLowerCase()))}
              keyExtractor={(p) => p.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const on = selected.has(item.id);
                return (
                  <TouchableOpacity onPress={() => toggleSelect(item.id)} className="flex-row items-center py-2.5 border-b border-slate-100 dark:border-slate-800 active:bg-slate-50 dark:active:bg-slate-800">
                    <View className={`w-6 h-6 rounded border-2 items-center justify-center mr-3 ${on ? 'border-primary-600 bg-primary-600' : 'border-slate-300 dark:border-slate-600'}`}>
                      {on && <Text className="text-white text-xs font-bold">✓</Text>}
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm text-slate-800 dark:text-slate-100">{item.name}</Text>
                      <Text className="text-xs text-slate-400 dark:text-slate-500">Stock: {item.stock_quantity}</Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={<Text className="text-slate-400 dark:text-slate-500 text-sm text-center py-4">{t('common.noResults')}</Text>}
            />
            <TouchableOpacity onPress={() => setShowAddProducts(false)} className="mt-3 bg-primary-600 rounded-xl py-3 items-center">
              <Text className="text-white font-semibold text-sm">{t('common.done')} {selected.size > 0 ? `(${selected.size})` : ''}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* PO Preview */}
      <POPreviewModal
        visible={showPO}
        poId={poId}
        items={poItems}
        vendor={selectedVendor}
        onCopy={async () => { await Clipboard.setStringAsync(poText(poItems, poId, selectedVendor)); }}
        onShare={async () => { await Share.share({ message: poText(poItems, poId, selectedVendor) }); }}
        onClose={() => setShowPO(false)}
      />

      {/* Header */}
      <View className="px-4 pt-4 pb-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-xl font-bold text-slate-900 dark:text-slate-50">{t('procurement.title')}</Text>
          {tab === 'lowstock' && (
            <View className="flex-row items-center gap-2">
              <TouchableOpacity onPress={() => { setAddSearch(''); setShowAddProducts(true); }} className="flex-row items-center bg-primary-50 dark:bg-primary-900 rounded-lg px-3 py-2 active:bg-primary-100 dark:active:bg-primary-800">
                <Text className="text-primary-700 dark:text-primary-200 font-semibold text-sm">+ {t('procurement.addProducts')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleGeneratePO}
                disabled={selected.size === 0}
                className={`rounded-lg px-4 py-2 ${selected.size > 0 ? 'bg-primary-600' : 'bg-slate-200 dark:bg-slate-800'}`}
              >
                <Text className={`font-semibold text-sm ${selected.size > 0 ? 'text-white' : 'text-slate-400 dark:text-slate-500'}`}>{t('procurement.generatePO')}{selected.size > 0 ? ` (${selected.size})` : ''}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        {/* Tab switcher */}
        <View className="flex-row mb-0">
          {(['lowstock', 'orders'] as Tab[]).map((t_) => (
            <TouchableOpacity
              key={t_}
              onPress={() => setTab(t_)}
              className={`flex-1 py-2.5 items-center border-b-2 ${tab === t_ ? 'border-primary-600' : 'border-transparent'}`}
            >
              <Text className={`text-sm font-semibold ${tab === t_ ? 'text-primary-600 dark:text-primary-300' : 'text-slate-500 dark:text-slate-400'}`}>
                {t_ === 'lowstock' ? `${t('procurement.lowStockAlert')} ${lowStock.length > 0 ? `(${lowStock.length})` : ''}` : `${t('vendors.orders')} (${orders.length})`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#2563eb" /></View>
      ) : tab === 'lowstock' ? (
        <FlatList
          data={lowStock}
          keyExtractor={(item) => item.id}
          contentContainerClassName="pb-4"
          renderItem={({ item }) => (
            <LowStockRow product={item} selected={selected.has(item.id)} onToggle={() => toggleSelect(item.id)} />
          )}
          ListEmptyComponent={
            <View className="items-center py-16">
              <Text className="text-3xl mb-3">✅</Text>
              <Text className="text-slate-400 dark:text-slate-500 text-base">{t('procurement.noLowStock')}</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          contentContainerClassName="pt-3 pb-6"
          renderItem={({ item }) => <POHistoryRow po={item} onReceive={() => handleReceive(item.id)} />}
          ListEmptyComponent={
            <View className="items-center py-16">
              <Text className="text-3xl mb-3">📋</Text>
              <Text className="text-slate-400 dark:text-slate-500 text-base">{t('vendors.noPOs')}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}
