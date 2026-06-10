import { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ChevronRight, ChevronDown, Check } from 'lucide-react-native';
import type { Category } from '../../db/repositories/categoryRepository';

/**
 * Hierarchical single-select category picker. Expands/collapses nested
 * categories so deep trees (e.g. Electrical › Wires › Copper) stay navigable.
 */
export default function CategoryTreePicker({ categories, value, onChange, noneLabel }: {
  categories: Category[];
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  noneLabel: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const childrenOf = (pid: string | null) => categories.filter((c) => (c.parent_id ?? null) === pid);
  const toggle = (id: string) => setExpanded((p) => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const renderNode = (c: Category, depth: number): React.ReactNode => {
    const kids = childrenOf(c.id);
    const open = expanded.has(c.id);
    const selected = value === c.id;
    return (
      <View key={c.id}>
        <View className="flex-row items-center" style={{ paddingLeft: depth * 16 }}>
          {kids.length > 0
            ? <TouchableOpacity onPress={() => toggle(c.id)} className="p-1.5">{open ? <ChevronDown size={14} color="#94a3b8" /> : <ChevronRight size={14} color="#94a3b8" />}</TouchableOpacity>
            : <View className="w-6" />}
          <TouchableOpacity onPress={() => onChange(selected ? null : c.id)} className={`flex-1 flex-row items-center justify-between px-2.5 py-1.5 my-0.5 rounded-lg ${selected ? 'bg-primary-600' : ''}`}>
            <Text className={`text-sm ${selected ? 'text-white font-medium' : 'text-slate-700 dark:text-slate-200'}`}>{c.name}</Text>
            {selected && <Check size={14} color="#ffffff" />}
          </TouchableOpacity>
        </View>
        {open && kids.map((k) => renderNode(k, depth + 1))}
      </View>
    );
  };

  return (
    <View className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl p-2">
      <TouchableOpacity onPress={() => onChange(null)} className={`px-2.5 py-1.5 rounded-lg ${!value ? 'bg-slate-200 dark:bg-slate-800' : ''}`}>
        <Text className={`text-sm ${!value ? 'text-slate-900 dark:text-slate-50 font-medium' : 'text-slate-500 dark:text-slate-400'}`}>{noneLabel}</Text>
      </TouchableOpacity>
      {childrenOf(null).map((c) => renderNode(c, 0))}
    </View>
  );
}
