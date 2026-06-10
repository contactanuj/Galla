import { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ChevronRight, ChevronDown, Check } from 'lucide-react-native';
import type { LayoutNode } from '../../db/repositories/layoutRepository';

/**
 * Hierarchical single-select picker for a store-layout node
 * (section > aisle > rack > shelf). Used to place a product at a location.
 */
export default function LayoutNodePicker({ nodes, value, onChange, noneLabel }: {
  nodes: LayoutNode[];
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  noneLabel: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const childrenOf = (pid: string | null) =>
    nodes.filter((n) => (n.parent_id ?? null) === pid).sort((a, b) => a.position_index - b.position_index);
  const toggle = (id: string) => setExpanded((p) => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const renderNode = (n: LayoutNode, depth: number): React.ReactNode => {
    const kids = childrenOf(n.id);
    const open = expanded.has(n.id);
    const selected = value === n.id;
    return (
      <View key={n.id}>
        <View className="flex-row items-center" style={{ paddingLeft: depth * 16 }}>
          {kids.length > 0
            ? <TouchableOpacity onPress={() => toggle(n.id)} className="p-1.5">{open ? <ChevronDown size={14} color="#94a3b8" /> : <ChevronRight size={14} color="#94a3b8" />}</TouchableOpacity>
            : <View className="w-6" />}
          <TouchableOpacity onPress={() => onChange(selected ? null : n.id)} className={`flex-1 flex-row items-center justify-between px-2.5 py-1.5 my-0.5 rounded-lg ${selected ? 'bg-primary-600' : ''}`}>
            <View className="flex-row items-center gap-2">
              <Text className={`text-sm ${selected ? 'text-white font-medium' : 'text-slate-700 dark:text-slate-200'}`}>{n.name}</Text>
              <Text className={`text-[10px] uppercase ${selected ? 'text-primary-100' : 'text-slate-400 dark:text-slate-500'}`}>{n.type}</Text>
            </View>
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
      {childrenOf(null).map((n) => renderNode(n, 0))}
    </View>
  );
}
