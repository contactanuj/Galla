import { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Modal, Image, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from 'expo-router';
import {
  ChevronRight, ChevronDown, Plus, Pencil, Trash2, ArrowUp, ArrowDown,
  FolderInput, MapPin, ImagePlus, X, Boxes, Search, Package,
} from 'lucide-react-native';
import { useIsAdmin } from '../../../hooks/useRoleGuard';
import { useResponsiveLayout } from '../../../hooks/useResponsiveLayout';
import {
  getAllLayoutNodes, createLayoutNode, updateLayoutNode, deleteLayoutNode, moveLayoutNode,
  setLayoutNodePosition, setLayoutNodeImage, removeProductLocation, moveProductLocation,
  getProductsAtNode, getProductLocationPath, type LayoutNode,
} from '../../../db/repositories/layoutRepository';
import { getAllProducts } from '../../../db/repositories/productRepository';
import { chooseImageSource, uploadImage } from '../../../lib/imageUpload';
import { newId } from '../../../lib/id';

const TYPE_ORDER: LayoutNode['type'][] = ['section', 'aisle', 'rack', 'shelf'];
const nextType = (t: LayoutNode['type']) => TYPE_ORDER[Math.min(TYPE_ORDER.indexOf(t) + 1, TYPE_ORDER.length - 1)];

type RowProps = {
  node: LayoutNode; depth: number; nodes: LayoutNode[]; expanded: Set<string>; selectedId: string | null;
  onToggle: (id: string) => void; onSelect: (n: LayoutNode) => void; t: (k: string) => string;
};

function NodeRow({ node, depth, nodes, expanded, selectedId, onToggle, onSelect, t }: RowProps) {
  const children = nodes.filter((n) => (n.parent_id ?? null) === node.id).sort((a, b) => a.position_index - b.position_index);
  const isOpen = expanded.has(node.id);
  const thumb = node.image_uri ?? node.image_url;
  return (
    <View>
      <TouchableOpacity onPress={() => onSelect(node)} className={`flex-row items-center py-2.5 pr-3 border-b border-slate-100 dark:border-slate-800 ${selectedId === node.id ? 'bg-primary-50' : 'bg-white dark:bg-slate-900'}`} style={{ paddingLeft: depth * 18 + 6 }}>
        {children.length > 0 ? (
          <TouchableOpacity onPress={() => onToggle(node.id)} className="p-1 mr-0.5">
            {isOpen ? <ChevronDown size={16} color="#94a3b8" /> : <ChevronRight size={16} color="#94a3b8" />}
          </TouchableOpacity>
        ) : <View className="w-6" />}
        {thumb
          ? <Image source={{ uri: thumb }} className="w-7 h-7 rounded mr-2" />
          : <View className="w-7 h-7 rounded bg-slate-100 dark:bg-slate-800 items-center justify-center mr-2"><Boxes size={14} color="#94a3b8" /></View>}
        <View className="flex-1">
          <Text className="text-sm font-medium text-slate-900 dark:text-slate-50">{node.name}</Text>
          <Text className="text-[10px] text-slate-400 dark:text-slate-500">{t(`layout.${node.type}`)}</Text>
        </View>
        {selectedId === node.id && <View className="w-1.5 h-1.5 rounded-full bg-primary-600" />}
      </TouchableOpacity>
      {isOpen && children.map((c) => (
        <NodeRow key={c.id} node={c} depth={depth + 1} nodes={nodes} expanded={expanded} selectedId={selectedId} onToggle={onToggle} onSelect={onSelect} t={t} />
      ))}
    </View>
  );
}

export default function LayoutScreen() {
  const { t } = useTranslation();
  const { isCompact } = useResponsiveLayout();
  const isAdmin = useIsAdmin();
  const [nodes, setNodes] = useState<LayoutNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<LayoutNode | null>(null);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [productsHere, setProductsHere] = useState<{ id: string; name: string }[]>([]);
  const [locations, setLocations] = useState<Record<string, string[]>>({});
  const [productQuery, setProductQuery] = useState('');

  const [addCtx, setAddCtx] = useState<{ parentId: string | null } | null>(null);
  const [renameTarget, setRenameTarget] = useState<LayoutNode | null>(null);
  const [moveTarget, setMoveTarget] = useState<LayoutNode | null>(null);
  const [nodeName, setNodeName] = useState('');
  const [nodeType, setNodeType] = useState<LayoutNode['type']>('section');

  const loadNodes = useCallback(async () => {
    const all = await getAllLayoutNodes();
    setNodes(all);
    setSelected((prev) => (prev ? all.find((n) => n.id === prev.id) ?? null : null));
  }, []);

  const loadProducts = useCallback(async () => {
    const all = await getAllProducts('cashier');
    setProducts(all.map((p) => ({ id: p.id, name: p.name })));
    const locs: Record<string, string[]> = {};
    for (const p of all) { const path = await getProductLocationPath(p.id); if (path.length) locs[p.id] = path; }
    setLocations(locs);
  }, []);

  useFocusEffect(useCallback(() => { loadNodes(); loadProducts(); }, [loadNodes, loadProducts]));

  const childrenOf = (pid: string | null) => nodes.filter((n) => (n.parent_id ?? null) === pid).sort((a, b) => a.position_index - b.position_index);
  const descendantIds = (id: string): Set<string> => {
    const out = new Set<string>([id]);
    let added = true;
    while (added) { added = false; for (const n of nodes) { if (n.parent_id && out.has(n.parent_id) && !out.has(n.id)) { out.add(n.id); added = true; } } }
    return out;
  };

  const toggle = (id: string) => setExpanded((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const selectNode = async (n: LayoutNode) => { setSelected(n); setProductQuery(''); setProductsHere(await getProductsAtNode(n.id)); };
  const refreshSelected = async (n: LayoutNode) => { setProductsHere(await getProductsAtNode(n.id)); await loadProducts(); };

  // --- node operations ---
  const openAdd = (parentId: string | null, type: LayoutNode['type']) => { setAddCtx({ parentId }); setNodeName(''); setNodeType(type); };
  const handleCreate = async () => {
    if (!nodeName.trim() || !addCtx) return;
    const siblings = childrenOf(addCtx.parentId);
    const id = newId('ln');
    await createLayoutNode({ id, name: nodeName.trim(), type: nodeType, parent_id: addCtx.parentId ?? undefined, position_index: siblings.length, metadata: undefined });
    if (addCtx.parentId) setExpanded((p) => new Set(p).add(addCtx.parentId!));
    setAddCtx(null);
    await loadNodes();
  };
  const handleRename = async () => {
    if (!renameTarget || !nodeName.trim()) return;
    await updateLayoutNode(renameTarget.id, nodeName.trim(), renameTarget.position_index);
    setRenameTarget(null);
    await loadNodes();
  };
  const handleDelete = (n: LayoutNode) => {
    Alert.alert(n.name, t('layout.delete') + '?', [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('layout.delete'), style: 'destructive', onPress: async () => { await deleteLayoutNode(n.id); if (selected?.id === n.id) setSelected(null); await loadNodes(); } },
    ]);
  };
  const doMoveNode = async (targetParentId: string | null) => {
    if (!moveTarget) return;
    await moveLayoutNode(moveTarget.id, targetParentId);
    setMoveTarget(null);
    await loadNodes();
  };
  const reorder = async (n: LayoutNode, dir: -1 | 1) => {
    const sibs = childrenOf(n.parent_id ?? null);
    const idx = sibs.findIndex((s) => s.id === n.id);
    const j = idx + dir;
    if (j < 0 || j >= sibs.length) return;
    await setLayoutNodePosition(n.id, j);
    await setLayoutNodePosition(sibs[j].id, idx);
    await loadNodes();
  };
  const pickNodeImage = async (n: LayoutNode) => {
    const uri = await chooseImageSource();
    if (!uri) return;
    const url = await uploadImage(uri, 'layout');
    await setLayoutNodeImage(n.id, uri, url);
    setSelected((s) => (s ? { ...s, image_uri: uri, image_url: url } : s));
    await loadNodes();
  };

  // --- product placement / move ---
  const placeProduct = async (productId: string) => { if (!selected) return; await moveProductLocation(productId, selected.id); setProductQuery(''); await refreshSelected(selected); };
  const unplaceProduct = async (productId: string) => { if (!selected) return; await removeProductLocation(productId, selected.id); await refreshSelected(selected); };

  const roots = childrenOf(null);
  const filteredProducts = (productQuery ? products.filter((p) => p.name.toLowerCase().includes(productQuery.toLowerCase())) : products).slice(0, 25);
  const moveBlocked = moveTarget ? descendantIds(moveTarget.id) : new Set<string>();
  const sel = selected;
  const selSiblings = sel ? childrenOf(sel.parent_id ?? null) : [];
  const selIdx = sel ? selSiblings.findIndex((s) => s.id === sel.id) : -1;

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      {/* Add modal */}
      <Modal visible={!!addCtx} transparent animationType="slide" onRequestClose={() => setAddCtx(null)}>
        <View className="flex-1 bg-black/50 justify-center items-center p-6">
          <View className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-sm">
            <Text className="text-lg font-bold text-slate-900 dark:text-slate-50 mb-4">{t('layout.addNode')}</Text>
            <TextInput className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 mb-4 text-slate-900 dark:text-slate-50" placeholder={t('layout.nodeName')} value={nodeName} onChangeText={setNodeName} autoFocus />
            <Text className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">{t('layout.nodeType')}</Text>
            <View className="flex-row flex-wrap gap-2 mb-5">
              {TYPE_ORDER.map((type) => (
                <TouchableOpacity key={type} onPress={() => setNodeType(type)} className={`rounded-lg px-3 py-2 border ${nodeType === type ? 'bg-primary-600 border-primary-600' : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600'}`}>
                  <Text className={`text-sm ${nodeType === type ? 'text-white' : 'text-slate-700 dark:text-slate-200'}`}>{t(`layout.${type}`)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View className="flex-row gap-3">
              <TouchableOpacity onPress={() => setAddCtx(null)} className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-lg py-2.5 items-center"><Text className="text-slate-700 dark:text-slate-200 font-medium">{t('common.cancel')}</Text></TouchableOpacity>
              <TouchableOpacity onPress={handleCreate} className="flex-1 bg-primary-600 rounded-lg py-2.5 items-center"><Text className="text-white font-medium">{t('common.add')}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Rename modal */}
      <Modal visible={!!renameTarget} transparent animationType="slide" onRequestClose={() => setRenameTarget(null)}>
        <View className="flex-1 bg-black/50 justify-center items-center p-6">
          <View className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-sm">
            <Text className="text-lg font-bold text-slate-900 dark:text-slate-50 mb-4">{t('layout.rename')}</Text>
            <TextInput className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 mb-4 text-slate-900 dark:text-slate-50" value={nodeName} onChangeText={setNodeName} autoFocus />
            <View className="flex-row gap-3">
              <TouchableOpacity onPress={() => setRenameTarget(null)} className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-lg py-2.5 items-center"><Text className="text-slate-700 dark:text-slate-200 font-medium">{t('common.cancel')}</Text></TouchableOpacity>
              <TouchableOpacity onPress={handleRename} className="flex-1 bg-primary-600 rounded-lg py-2.5 items-center"><Text className="text-white font-medium">{t('common.save')}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Move (re-parent) modal */}
      <Modal visible={!!moveTarget} transparent animationType="slide" onRequestClose={() => setMoveTarget(null)}>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white dark:bg-slate-900 rounded-t-3xl p-5 max-h-[75%]">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-lg font-bold text-slate-900 dark:text-slate-50">{t('layout.moveTo')}</Text>
              <TouchableOpacity onPress={() => setMoveTarget(null)}><X size={22} color="#64748b" /></TouchableOpacity>
            </View>
            <Text className="text-sm text-slate-500 dark:text-slate-400 mb-3">{moveTarget?.name}</Text>
            <ScrollView>
              <TouchableOpacity onPress={() => doMoveNode(null)} className="flex-row items-center py-3 border-b border-slate-100 dark:border-slate-800">
                <MapPin size={16} color="#2563eb" /><Text className="text-sm font-medium text-slate-700 dark:text-slate-200 ml-2">{t('layout.topLevel')}</Text>
              </TouchableOpacity>
              {nodes.filter((n) => !moveBlocked.has(n.id) && n.id !== (moveTarget?.parent_id ?? '')).map((n) => (
                <TouchableOpacity key={n.id} onPress={() => doMoveNode(n.id)} className="flex-row items-center py-3 border-b border-slate-100 dark:border-slate-800">
                  <Boxes size={16} color="#64748b" />
                  <Text className="text-sm text-slate-800 dark:text-slate-100 ml-2">{n.name}</Text>
                  <Text className="text-[10px] text-slate-400 dark:text-slate-500 ml-2">{t(`layout.${n.type}`)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View className="px-4 pt-4 pb-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex-row items-center justify-between">
        <Text className="text-xl font-bold text-slate-900 dark:text-slate-50">{t('layout.title')}</Text>
        {isAdmin && (
          <TouchableOpacity onPress={() => openAdd(null, 'section')} className="bg-primary-600 rounded-lg px-3 py-2 flex-row items-center active:bg-primary-700">
            <Plus size={16} color="#fff" /><Text className="text-white font-medium text-sm ml-1">{t('layout.section')}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View className={`flex-1 ${isCompact ? 'flex-col' : 'flex-row'}`}>
        {/* Tree */}
        <ScrollView className={isCompact ? 'flex-1' : 'flex-1'}>
          {roots.length === 0 ? (
            <View className="items-center py-16 px-8"><Boxes size={40} color="#cbd5e1" /><Text className="text-slate-400 dark:text-slate-500 text-sm text-center mt-3">{t('layout.emptyTree')}</Text></View>
          ) : (
            roots.map((n) => (
              <NodeRow key={n.id} node={n} depth={0} nodes={nodes} expanded={expanded} selectedId={selected?.id ?? null} onToggle={toggle} onSelect={selectNode} t={t} />
            ))
          )}
        </ScrollView>

        {/* Selected node panel */}
        {sel && (
          <View className={`${isCompact ? 'border-t' : 'w-96 border-l'} border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900`} style={isCompact ? { maxHeight: '55%' } : undefined}>
            <ScrollView contentContainerClassName="p-4">
              {/* Node header */}
              <View className="flex-row items-center mb-3">
                <TouchableOpacity onPress={() => isAdmin && pickNodeImage(sel)} className="w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 items-center justify-center overflow-hidden mr-3">
                  {sel.image_uri ?? sel.image_url
                    ? <Image source={{ uri: (sel.image_uri ?? sel.image_url)! }} className="w-14 h-14" resizeMode="cover" />
                    : <ImagePlus size={20} color="#94a3b8" />}
                </TouchableOpacity>
                <View className="flex-1">
                  <Text className="text-base font-bold text-slate-900 dark:text-slate-50">{sel.name}</Text>
                  <Text className="text-xs text-slate-400 dark:text-slate-500">{t(`layout.${sel.type}`)}</Text>
                </View>
                <TouchableOpacity onPress={() => setSelected(null)} className="p-1"><X size={18} color="#94a3b8" /></TouchableOpacity>
              </View>

              {/* Admin actions */}
              {isAdmin && (
                <View className="flex-row flex-wrap gap-2 mb-4">
                  <TouchableOpacity onPress={() => openAdd(sel.id, nextType(sel.type))} className="flex-row items-center bg-primary-50 rounded-lg px-2.5 py-2">
                    <Plus size={14} color="#2563eb" /><Text className="text-primary-700 text-xs font-medium ml-1">{t('layout.addChild')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setRenameTarget(sel); setNodeName(sel.name); }} className="flex-row items-center bg-slate-100 dark:bg-slate-800 rounded-lg px-2.5 py-2">
                    <Pencil size={14} color="#475569" /><Text className="text-slate-700 dark:text-slate-200 text-xs font-medium ml-1">{t('layout.rename')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setMoveTarget(sel)} className="flex-row items-center bg-slate-100 dark:bg-slate-800 rounded-lg px-2.5 py-2">
                    <FolderInput size={14} color="#475569" /><Text className="text-slate-700 dark:text-slate-200 text-xs font-medium ml-1">{t('layout.moveNode')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => reorder(sel, -1)} disabled={selIdx <= 0} className={`bg-slate-100 dark:bg-slate-800 rounded-lg px-2.5 py-2 ${selIdx <= 0 ? 'opacity-40' : ''}`}><ArrowUp size={14} color="#475569" /></TouchableOpacity>
                  <TouchableOpacity onPress={() => reorder(sel, 1)} disabled={selIdx === selSiblings.length - 1} className={`bg-slate-100 dark:bg-slate-800 rounded-lg px-2.5 py-2 ${selIdx === selSiblings.length - 1 ? 'opacity-40' : ''}`}><ArrowDown size={14} color="#475569" /></TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(sel)} className="flex-row items-center bg-rose-50 rounded-lg px-2.5 py-2">
                    <Trash2 size={14} color="#e11d48" /><Text className="text-rose-600 text-xs font-medium ml-1">{t('layout.delete')}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Products at this node */}
              <View className="flex-row items-center mb-2">
                <MapPin size={16} color="#2563eb" />
                <Text className="text-sm font-bold text-slate-900 dark:text-slate-50 ml-2">{t('layout.productsHere')}</Text>
              </View>
              {productsHere.length === 0 ? (
                <Text className="text-xs text-slate-400 dark:text-slate-500 mb-3">{t('layout.noProductsHere')}</Text>
              ) : (
                productsHere.map((p) => (
                  <View key={p.id} className="flex-row items-center bg-slate-50 dark:bg-slate-950 rounded-lg px-3 py-2 mb-1.5">
                    <Package size={14} color="#64748b" />
                    <Text className="flex-1 text-sm text-slate-800 dark:text-slate-100 ml-2">{p.name}</Text>
                    {isAdmin && <TouchableOpacity onPress={() => unplaceProduct(p.id)} className="p-1"><X size={15} color="#ef4444" /></TouchableOpacity>}
                  </View>
                ))
              )}

              {/* Place / move a product here */}
              {isAdmin && (
                <View className="mt-3">
                  <Text className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">{t('layout.placeProduct')}</Text>
                  <View className="flex-row items-center bg-slate-100 dark:bg-slate-800 rounded-lg px-3 py-2 mb-2">
                    <Search size={15} color="#94a3b8" />
                    <TextInput className="flex-1 ml-2 text-slate-900 dark:text-slate-50 text-sm" placeholder={t('layout.searchProduct')} value={productQuery} onChangeText={setProductQuery} />
                  </View>
                  {filteredProducts.map((p) => {
                    const loc = locations[p.id];
                    const here = productsHere.some((x) => x.id === p.id);
                    return (
                      <TouchableOpacity key={p.id} onPress={() => placeProduct(p.id)} disabled={here} className={`flex-row items-center py-2 px-1 border-b border-slate-100 dark:border-slate-800 ${here ? 'opacity-40' : ''}`}>
                        <View className="flex-1">
                          <Text className="text-sm text-slate-900 dark:text-slate-50">{p.name}</Text>
                          {loc ? <Text className="text-[10px] text-slate-400 dark:text-slate-500">{loc.join(' › ')}</Text> : <Text className="text-[10px] text-slate-300 dark:text-slate-600">{t('layout.locationNotAssigned')}</Text>}
                        </View>
                        {here ? <Text className="text-[10px] text-emerald-600 font-medium">✓</Text> : <Plus size={15} color="#2563eb" />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </View>
        )}
      </View>
    </View>
  );
}
