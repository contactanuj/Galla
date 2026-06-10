import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { Plus, X } from 'lucide-react-native';

export interface VariantDraft {
  id?: string;
  name: string;
  selling_price: number;
  stock_quantity: number;
  barcode?: string;
}

/**
 * Edits a product's variants (size / colour / spec SKUs), each with its own
 * price, stock and optional barcode. Module-scoped so inputs keep focus.
 */
export default function VariantEditor({ value, onChange, t }: {
  value: VariantDraft[];
  onChange: (v: VariantDraft[]) => void;
  t: (k: string) => string;
}) {
  const update = (i: number, patch: Partial<VariantDraft>) => onChange(value.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  const add = () => onChange([...value, { name: '', selling_price: 0, stock_quantity: 0, barcode: '' }]);
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <View>
      {value.map((v, i) => (
        <View key={i} className="bg-slate-50 dark:bg-slate-950 rounded-xl p-3 mb-2 border border-slate-200 dark:border-slate-700">
          <View className="flex-row items-center mb-2">
            <TextInput value={v.name} onChangeText={(x) => update(i, { name: x })} placeholder={t('variants.namePlaceholder')} className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-50" />
            <TouchableOpacity onPress={() => remove(i)} className="p-1 ml-2"><X size={16} color="#ef4444" /></TouchableOpacity>
          </View>
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Text className="text-[10px] text-slate-400 dark:text-slate-500 mb-0.5">{t('inventory.sellingPrice')}</Text>
              <TextInput value={v.selling_price ? String(v.selling_price) : ''} onChangeText={(x) => update(i, { selling_price: parseFloat(x) || 0 })} keyboardType="decimal-pad" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-50" />
            </View>
            <View className="flex-1">
              <Text className="text-[10px] text-slate-400 dark:text-slate-500 mb-0.5">{t('inventory.stockQuantity')}</Text>
              <TextInput value={v.stock_quantity ? String(v.stock_quantity) : ''} onChangeText={(x) => update(i, { stock_quantity: parseInt(x, 10) || 0 })} keyboardType="number-pad" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-50" />
            </View>
          </View>
          <Text className="text-[10px] text-slate-400 dark:text-slate-500 mb-0.5 mt-2">{t('variants.barcode')}</Text>
          <TextInput value={v.barcode ?? ''} onChangeText={(x) => update(i, { barcode: x })} placeholder={t('variants.barcodePlaceholder')} autoCapitalize="none" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-50" />
        </View>
      ))}
      <TouchableOpacity onPress={add} className="flex-row items-center justify-center py-2.5 border border-dashed border-slate-300 dark:border-slate-600 rounded-xl">
        <Plus size={14} color="#2563eb" /><Text className="text-primary-600 text-xs font-medium ml-1">{t('variants.add')}</Text>
      </TouchableOpacity>
    </View>
  );
}
