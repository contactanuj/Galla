import { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, Modal, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  getAllTenants, createTenant, updateTenant, deleteTenant,
  type TenantWithStats, type Tenant,
} from '../../../db/repositories/tenantRepository';

const PLANS: Tenant['plan'][] = ['standard', 'professional', 'enterprise'];

function TenantRow({ tenant, onEdit, onToggle }: { tenant: TenantWithStats; onEdit: () => void; onToggle: () => void }) {
  return (
    <View className="bg-white dark:bg-slate-900 mx-4 mb-3 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-base font-semibold text-slate-900 dark:text-slate-50 flex-1">{tenant.name}</Text>
        <View className={`w-2.5 h-2.5 rounded-full ml-2 ${tenant.is_active ? 'bg-green-500' : 'bg-slate-300'}`} />
      </View>
      <View className="flex-row gap-3 mb-3">
        <Text className="text-xs text-slate-500 dark:text-slate-400 capitalize">{tenant.plan}</Text>
        <Text className="text-xs text-slate-400 dark:text-slate-500">·</Text>
        <Text className="text-xs text-slate-500 dark:text-slate-400">{tenant.user_count} users</Text>
      </View>
      <View className="flex-row gap-2">
        <TouchableOpacity onPress={onEdit} className="flex-1 border border-slate-300 dark:border-slate-600 rounded-lg py-2 items-center">
          <Text className="text-slate-700 dark:text-slate-200 text-xs font-medium">Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onToggle} className={`flex-1 rounded-lg py-2 items-center ${tenant.is_active ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-200'}`}>
          <Text className={`text-xs font-medium ${tenant.is_active ? 'text-amber-700' : 'text-green-700'}`}>{tenant.is_active ? 'Deactivate' : 'Activate'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function TenantsScreen() {
  const router = useRouter();
  const [tenants, setTenants] = useState<TenantWithStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [formName, setFormName] = useState('');
  const [formPlan, setFormPlan] = useState<Tenant['plan']>('standard');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setTenants(await getAllTenants());
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openCreate = () => { setEditing(null); setFormName(''); setFormPlan('standard'); setShowModal(true); };
  const openEdit = (t: Tenant) => { setEditing(t); setFormName(t.name); setFormPlan(t.plan); setShowModal(true); };

  const handleSave = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      // Pushes directly to Supabase (throws if the server rejects it)
      if (editing) await updateTenant(editing.id, { name: formName.trim(), plan: formPlan });
      else await createTenant(formName.trim(), formPlan);
      setShowModal(false);
    } catch (e: any) {
      Alert.alert('Sync error', e?.message ?? 'Could not save to the server. Check your connection and try again.');
    }
    setSaving(false);
    await load();
  };

  const handleToggle = async (t: TenantWithStats) => {
    const run = async (fn: () => Promise<void>) => {
      try { await fn(); } catch (e: any) { Alert.alert('Sync error', e?.message ?? 'Could not update on the server.'); }
      await load();
    };
    if (t.is_active) {
      Alert.alert('Deactivate Tenant', `This will also deactivate all users of "${t.name}". Continue?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Deactivate', style: 'destructive', onPress: () => run(() => deleteTenant(t.id)) },
      ]);
    } else {
      run(() => updateTenant(t.id, { is_active: 1 }));
    }
  };

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <Modal visible={showModal} transparent animationType="slide">
        <View className="flex-1 bg-black/50 justify-center items-center p-6">
          <View className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-sm">
            <Text className="text-lg font-bold text-slate-900 dark:text-slate-50 mb-4">{editing ? 'Edit Tenant' : 'New Tenant'}</Text>
            <Text className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">Tenant Name *</Text>
            <TextInput value={formName} onChangeText={setFormName} placeholder="Acme Corp" className="bg-slate-100 dark:bg-slate-800 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-slate-50 mb-4" />
            <Text className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">Plan</Text>
            <View className="flex-row gap-2 mb-5">
              {PLANS.map((p) => (
                <TouchableOpacity key={p} onPress={() => setFormPlan(p)} className={`flex-1 py-2 rounded-lg items-center border ${formPlan === p ? 'bg-primary-600 border-primary-600' : 'border-slate-300 dark:border-slate-600'}`}>
                  <Text className={`text-xs font-medium capitalize ${formPlan === p ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View className="flex-row gap-3">
              <TouchableOpacity onPress={() => setShowModal(false)} className="flex-1 border border-slate-300 dark:border-slate-600 rounded-xl py-3 items-center">
                <Text className="text-slate-700 dark:text-slate-200 font-medium text-sm">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave} disabled={saving || !formName.trim()} className="flex-1 bg-primary-600 rounded-xl py-3 items-center">
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text className="text-white font-semibold text-sm">Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View className="px-4 pt-4 pb-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
        <View className="flex-row items-center mb-0">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <Text className="text-primary-600 font-medium">← Back</Text>
          </TouchableOpacity>
          <Text className="text-xl font-bold text-slate-900 dark:text-slate-50 flex-1">Tenants</Text>
          <TouchableOpacity onPress={openCreate} className="bg-primary-600 rounded-lg px-4 py-2">
            <Text className="text-white font-semibold text-sm">+ Add</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#2563eb" /></View>
      ) : (
        <FlatList
          data={tenants}
          keyExtractor={(t) => t.id}
          contentContainerClassName="pt-3 pb-6"
          renderItem={({ item }) => <TenantRow tenant={item} onEdit={() => openEdit(item)} onToggle={() => handleToggle(item)} />}
          ListEmptyComponent={
            <View className="items-center py-16">
              <Text className="text-slate-400 dark:text-slate-500 text-base">No tenants yet</Text>
            </View>
          }
        />
      )}
    </View>
  );
}
