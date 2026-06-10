import { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, Modal, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { getAllUsers, createUser, updateUser, deleteUser, type User } from '../../../db/repositories/userRepository';
import { getAllTenants, type Tenant } from '../../../db/repositories/tenantRepository';
import type { UserRole } from '../../../constants/roles';
import { supabase, supabaseEnabled, supabaseUrl, supabaseAnonKey } from '../../../lib/supabase';
import { createClient } from '@supabase/supabase-js';

const ROLES: UserRole[] = ['admin', 'cashier'];
const ROLE_COLORS: Record<string, string> = {
  system_admin: 'bg-violet-100 text-violet-700',
  admin: 'bg-blue-100 text-blue-700',
  cashier: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
};

function UserRow({ user, onEdit, onToggle }: { user: User; onEdit: () => void; onToggle: () => void }) {
  const roleStyle = ROLE_COLORS[user.role] ?? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
  return (
    <View className="bg-white dark:bg-slate-900 mx-4 mb-3 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-sm font-semibold text-slate-900 dark:text-slate-50 flex-1">{user.name}</Text>
        <View className={`rounded-full px-2 py-0.5 ml-2 ${roleStyle.split(' ')[0]}`}>
          <Text className={`text-xs font-medium ${roleStyle.split(' ')[1]}`}>{user.role}</Text>
        </View>
      </View>
      <Text className="text-xs text-slate-500 dark:text-slate-400 mb-3">{user.email}</Text>
      <View className="flex-row gap-2">
        {user.role !== 'system_admin' && (
          <>
            <TouchableOpacity onPress={onEdit} className="flex-1 border border-slate-300 dark:border-slate-600 rounded-lg py-2 items-center">
              <Text className="text-slate-700 dark:text-slate-200 text-xs font-medium">Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onToggle} className={`flex-1 rounded-lg py-2 items-center ${user.is_active ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-200'}`}>
              <Text className={`text-xs font-medium ${user.is_active ? 'text-amber-700' : 'text-green-700'}`}>{user.is_active ? 'Disable' : 'Enable'}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

export default function UsersScreen() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'cashier' as UserRole, tenant_id: '' });
  const [saving, setSaving] = useState(false);
  const [filterTenant, setFilterTenant] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [u, t] = await Promise.all([getAllUsers(filterTenant), getAllTenants()]);
    setUsers(u); setTenants(t);
    setLoading(false);
  }, [filterTenant]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const set = (key: keyof typeof form) => (val: string) => setForm((f) => ({ ...f, [key]: val }));

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', email: '', password: '', role: 'cashier', tenant_id: tenants[0]?.id ?? '' });
    setShowModal(true);
  };

  const openEdit = (u: User) => {
    setEditing(u);
    setForm({ name: u.name, email: u.email, password: '', role: u.role, tenant_id: u.tenant_id ?? '' });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim()) return;
    setSaving(true);
    try {
      // Ensure the chosen business exists in Supabase BEFORE touching user_profiles,
      // so its tenant_id foreign key is always satisfiable (the tenant may have been
      // created locally and not yet synced).
      if (supabaseEnabled && form.tenant_id) {
        const tenant = tenants.find((tn) => tn.id === form.tenant_id);
        if (tenant) {
          await supabase.from('tenants').upsert(
            { id: tenant.id, name: tenant.name, plan: tenant.plan, is_active: !!tenant.is_active },
            { onConflict: 'id' }
          );
        }
      }
      if (editing) {
        // Update profile in Supabase if connected
        if (supabaseEnabled) {
          await supabase.from('user_profiles').update({
            name: form.name,
            role: form.role,
            tenant_id: form.tenant_id || null,
          }).eq('id', editing.id);
        }
        const updates: Partial<User> = { name: form.name, email: form.email, role: form.role, tenant_id: form.tenant_id || null };
        await updateUser(editing.id, updates);
      } else {
        if (!form.password) { setSaving(false); Alert.alert('Error', 'Password is required for new users'); return; }

        if (supabaseEnabled) {
          // Create the auth user on a THROWAWAY client so signUp doesn't replace
          // this admin's session (which would make the profile insert run as the
          // new user and be rejected by RLS). Requires email confirmation OFF.
          const signupClient = createClient(supabaseUrl, supabaseAnonKey, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
          });
          const { data: authData, error: authErr } = await signupClient.auth.signUp({
            email: form.email.trim(),
            password: form.password,
            options: { data: { name: form.name } },
          });
          if (authErr || !authData.user) {
            const msg = authErr?.message ?? 'Failed to create user in Supabase';
            Alert.alert('Error', /already registered|already exists/i.test(msg)
              ? 'That email already has a login. If they can’t sign in, an earlier attempt created the account without a profile — recover it in Supabase (Authentication → Users → copy UID → add a user_profiles row), or use a different email.'
              : msg);
            setSaving(false);
            return;
          }
          // Insert the profile with the MAIN client (still the system_admin session,
          // so the RLS insert policy passes). Surface any error.
          const { error: profErr } = await supabase.from('user_profiles').insert({
            id: authData.user.id,
            name: form.name,
            role: form.role,
            tenant_id: form.tenant_id || null,
            is_active: true,
          });
          if (profErr) {
            Alert.alert('Error', 'Auth user created, but profile failed: ' + profErr.message);
            setSaving(false);
            return;
          }
          // Cache the profile locally (best-effort) so the user list renders.
          // We deliberately DO NOT store the password — Supabase Auth is the
          // source of truth and plaintext credentials must never live on device.
          try {
            await createUser({ id: authData.user.id, email: form.email.trim(), password_hash: '', name: form.name, role: form.role, tenant_id: form.tenant_id || null, is_active: 1 });
          } catch { /* email may collide with a seed account — non-fatal */ }
        } else {
          Alert.alert('Offline', 'User creation requires Supabase connectivity.');
          setSaving(false);
          return;
        }
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Something went wrong');
    }
    setSaving(false);
    setShowModal(false);
    await load();
  };

  const handleToggle = (u: User) => {
    Alert.alert(u.is_active ? 'Disable User' : 'Enable User', `${u.is_active ? 'Disable' : 'Enable'} "${u.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: u.is_active ? 'Disable' : 'Enable',
        onPress: async () => {
          const nextActive = u.is_active ? 0 : 1;
          // Source of truth is Supabase: flip is_active there so the user is
          // actually blocked from logging in on every device (login and
          // restoreSession both check the server profile). The local cache is
          // updated only as a mirror.
          if (supabaseEnabled) {
            try { await supabase.from('user_profiles').update({ is_active: nextActive === 1 }).eq('id', u.id); }
            catch { Alert.alert('Error', 'Could not reach the server. Try again when online.'); return; }
          }
          await (nextActive === 1 ? updateUser(u.id, { is_active: 1 }) : deleteUser(u.id));
          await load();
        },
      },
    ]);
  };

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <Modal visible={showModal} transparent animationType="slide">
        <View className="flex-1 bg-black/50 justify-center items-center p-6">
          <View className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-sm">
            <Text className="text-lg font-bold text-slate-900 dark:text-slate-50 mb-4">{editing ? 'Edit User' : 'New User'}</Text>
            <View className="mb-3">
              <Text className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Name *</Text>
              <TextInput value={form.name} onChangeText={set('name')} className="bg-slate-100 dark:bg-slate-800 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-slate-50" />
            </View>
            <View className="mb-3">
              <Text className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Email *</Text>
              <TextInput
                value={form.email}
                onChangeText={set('email')}
                editable={!editing}
                keyboardType="email-address"
                autoCapitalize="none"
                className={`rounded-xl px-4 py-3 text-sm ${editing ? 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-50'}`}
              />
              {editing ? <Text className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Email is managed by the auth provider and can't be changed here.</Text> : null}
            </View>
            {/* Passwords are set at creation via Supabase Auth. They cannot be
                changed from this client; the user resets via the auth flow. */}
            {!editing && (
              <View className="mb-3">
                <Text className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Password *</Text>
                <TextInput value={form.password} onChangeText={set('password')} secureTextEntry className="bg-slate-100 dark:bg-slate-800 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-slate-50" />
              </View>
            )}
            <Text className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">Role</Text>
            <View className="flex-row gap-2 mb-3">
              {ROLES.map((r) => (
                <TouchableOpacity key={r} onPress={() => setForm((f) => ({ ...f, role: r }))} className={`flex-1 py-2 rounded-lg items-center border ${form.role === r ? 'bg-primary-600 border-primary-600' : 'border-slate-300 dark:border-slate-600'}`}>
                  <Text className={`text-xs font-medium capitalize ${form.role === r ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">Tenant</Text>
            <View className="flex-row flex-wrap gap-2 mb-5">
              {tenants.map((t) => (
                <TouchableOpacity key={t.id} onPress={() => setForm((f) => ({ ...f, tenant_id: t.id }))} className={`px-3 py-1.5 rounded-full border text-xs ${form.tenant_id === t.id ? 'bg-primary-600 border-primary-600' : 'border-slate-300 dark:border-slate-600'}`}>
                  <Text className={`text-xs font-medium ${form.tenant_id === t.id ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>{t.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View className="flex-row gap-3">
              <TouchableOpacity onPress={() => setShowModal(false)} className="flex-1 border border-slate-300 dark:border-slate-600 rounded-xl py-3 items-center">
                <Text className="text-slate-700 dark:text-slate-200 font-medium text-sm">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave} disabled={saving} className="flex-1 bg-primary-600 rounded-xl py-3 items-center">
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text className="text-white font-semibold text-sm">Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View className="px-4 pt-4 pb-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
        <View className="flex-row items-center mb-3">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <Text className="text-primary-600 font-medium">← Back</Text>
          </TouchableOpacity>
          <Text className="text-xl font-bold text-slate-900 dark:text-slate-50 flex-1">Users</Text>
          <TouchableOpacity onPress={openCreate} className="bg-primary-600 rounded-lg px-4 py-2">
            <Text className="text-white font-semibold text-sm">+ Add</Text>
          </TouchableOpacity>
        </View>
        {/* Tenant filter chips */}
        <View className="flex-row gap-2 flex-wrap">
          <TouchableOpacity onPress={() => setFilterTenant(null)} className={`px-3 py-1 rounded-full border text-xs ${!filterTenant ? 'bg-primary-600 border-primary-600' : 'border-slate-300 dark:border-slate-600'}`}>
            <Text className={`text-xs font-medium ${!filterTenant ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>All</Text>
          </TouchableOpacity>
          {tenants.map((t) => (
            <TouchableOpacity key={t.id} onPress={() => setFilterTenant(t.id === filterTenant ? null : t.id)} className={`px-3 py-1 rounded-full border ${filterTenant === t.id ? 'bg-primary-600 border-primary-600' : 'border-slate-300 dark:border-slate-600'}`}>
              <Text className={`text-xs font-medium ${filterTenant === t.id ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>{t.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#2563eb" /></View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          contentContainerClassName="pt-3 pb-6"
          renderItem={({ item }) => <UserRow user={item} onEdit={() => openEdit(item)} onToggle={() => handleToggle(item)} />}
          ListEmptyComponent={<View className="items-center py-16"><Text className="text-slate-400 dark:text-slate-500 text-base">No users found</Text></View>}
        />
      )}
    </View>
  );
}
