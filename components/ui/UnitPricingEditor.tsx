import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { Plus, X } from 'lucide-react-native';
import type { ProductUnit } from '../../lib/units';
import type { Unit } from '../../db/repositories/unitRepository';

/**
 * Edits the ADDITIONAL selling units of a product (units larger than the base,
 * e.g. a Box of 12). Each row: unit name, its own price, and how many base
 * units it equals. The base unit + base price are managed by the form itself.
 * Defined at module scope so the inputs keep keyboard focus.
 */
export default function UnitPricingEditor({ configured, value, onChange, t }: {
  configured: Unit[];
  value: ProductUnit[];
  onChange: (v: ProductUnit[]) => void;
  t: (k: string) => string;
}) {
  const update = (i: number, patch: Partial<ProductUnit>) => onChange(value.map((u, idx) => (idx === i ? { ...u, ...patch } : u)));
  const add = () => onChange([...value, { name: configured[0]?.name ?? 'Box', price: 0, factor: 2 }]);
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <View>
      {value.map((u, i) => (
        <View key={i} className="bg-slate-50 dark:bg-slate-950 rounded-xl p-3 mb-2 border border-slate-200 dark:border-slate-700">
          <View className="flex-row items-center justify-between mb-2">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1 mr-2">
              {configured.map((c) => (
                <TouchableOpacity key={c.id} onPress={() => update(i, { name: c.name })} className={`px-2.5 py-1 rounded-full border mr-1.5 ${u.name === c.name ? 'bg-primary-600 border-primary-600' : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600'}`}>
                  <Text className={`text-xs ${u.name === c.name ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={() => remove(i)} className="p-1"><X size={16} color="#ef4444" /></TouchableOpacity>
          </View>
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Text className="text-[10px] text-slate-400 dark:text-slate-500 mb-0.5">{t('units.unitPrice')}</Text>
              <TextInput value={u.price ? String(u.price) : ''} onChangeText={(v) => update(i, { price: parseFloat(v) || 0 })} keyboardType="decimal-pad" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-50" />
            </View>
            <View className="flex-1">
              <Text className="text-[10px] text-slate-400 dark:text-slate-500 mb-0.5">{t('units.unitFactor')}</Text>
              <TextInput value={u.factor ? String(u.factor) : ''} onChangeText={(v) => update(i, { factor: parseInt(v, 10) || 1 })} keyboardType="number-pad" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-50" />
            </View>
          </View>
        </View>
      ))}
      <TouchableOpacity onPress={add} className="flex-row items-center justify-center py-2.5 border border-dashed border-slate-300 dark:border-slate-600 rounded-xl">
        <Plus size={14} color="#2563eb" /><Text className="text-primary-600 dark:text-primary-300 text-xs font-medium ml-1">{t('units.addUnitRow')}</Text>
      </TouchableOpacity>
    </View>
  );
}
