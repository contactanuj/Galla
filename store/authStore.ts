import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UserRole } from '../constants/roles';
import { setCurrentTenant } from '../lib/tenantContext';
import { supabase, supabaseEnabled } from '../lib/supabase';
import { getUserByEmail } from '../db/repositories/userRepository';

export interface UserProfile {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string | null;
}

interface AuthState extends UserProfile {
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<boolean>;
}

const EMPTY: Omit<UserProfile, never> = {
  userId: '', email: '', name: '', role: 'cashier', tenantId: null,
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      ...EMPTY,
      isAuthenticated: false,

      login: async (email: string, password: string) => {
        // --- Online path: Supabase Auth ---
        // If Supabase authenticates the user, it wins (source of truth).
        // If it fails for ANY reason (unreachable, user not provisioned yet,
        // missing profile), we fall through to the local SQLite seed accounts
        // so the offline/demo logins keep working.
        if (supabaseEnabled) {
          try {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (!error && data.user) {
              const { data: profile, error: profileErr } = await supabase
                .from('user_profiles')
                .select('tenant_id, name, role, is_active')
                .eq('id', data.user.id)
                .single();
              if (!profileErr && profile && profile.is_active) {
                set({
                  userId: data.user.id,
                  email: data.user.email ?? email,
                  name: profile.name,
                  role: profile.role as UserRole,
                  tenantId: profile.tenant_id ?? null,
                  isAuthenticated: true,
                });
                setCurrentTenant(profile.tenant_id ?? null, profile.role === 'system_admin', profile.role);
                return { success: true };
              }
              if (profile && !profile.is_active) {
                await supabase.auth.signOut();
                return { success: false, error: 'Account is disabled. Contact your administrator.' };
              }
              // Authenticated but no usable profile - drop the session and try local.
              await supabase.auth.signOut();
            }
          } catch {
            // Network error / Supabase unreachable - fall through to local.
          }
        }

        // --- Local SQLite path (offline + seeded demo accounts) ---
        const user = await getUserByEmail(email);
        if (!user || user.password_hash !== password) {
          return { success: false, error: 'Invalid email or password' };
        }
        if (!user.is_active) {
          return { success: false, error: 'Account is disabled. Contact your administrator.' };
        }
        set({
          userId: user.id,
          email: user.email,
          name: user.name,
          role: user.role as UserRole,
          tenantId: user.tenant_id ?? null,
          isAuthenticated: true,
        });
        setCurrentTenant(user.tenant_id ?? null, user.role === 'system_admin', user.role);
        return { success: true };
      },

      logout: async () => {
        if (supabaseEnabled) await supabase.auth.signOut();
        set({ ...EMPTY, isAuthenticated: false });
        setCurrentTenant(null, false);
      },

      /** Called on app start to restore a persisted Supabase session. */
      restoreSession: async () => {
        const persisted = get();
        const restoreFromPersisted = (): boolean => {
          if (persisted.isAuthenticated && persisted.userId) {
            setCurrentTenant(persisted.tenantId, persisted.role === 'system_admin', persisted.role);
            return true;
          }
          return false;
        };

        // Local-only mode: restore purely from Zustand persist.
        if (!supabaseEnabled) return restoreFromPersisted();

        // `getSession()` reads from storage and works offline (no network).
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          // No Supabase session - clear any stale persisted auth.
          if (persisted.isAuthenticated) { set({ ...EMPTY, isAuthenticated: false }); setCurrentTenant(null, false); }
          return false;
        }

        // We have a session; try to refresh the profile from the server. If that
        // fails (offline) but we have a matching persisted session, stay logged
        // in so the offline-first app keeps working across restarts.
        try {
          const { data: profile, error } = await supabase
            .from('user_profiles')
            .select('tenant_id, name, role, is_active')
            .eq('id', session.user.id)
            .single();
          if (error) throw error;
          if (!profile || !profile.is_active) {
            await supabase.auth.signOut();
            set({ ...EMPTY, isAuthenticated: false });
            setCurrentTenant(null, false);
            return false;
          }
          set({
            userId: session.user.id,
            email: session.user.email ?? '',
            name: profile.name,
            role: profile.role as UserRole,
            tenantId: profile.tenant_id ?? null,
            isAuthenticated: true,
          });
          setCurrentTenant(profile.tenant_id ?? null, profile.role === 'system_admin', profile.role);
          return true;
        } catch {
          // Offline (or transient): fall back to the persisted session if it
          // belongs to the same user.
          if (persisted.isAuthenticated && persisted.userId === session.user.id) {
            setCurrentTenant(persisted.tenantId, persisted.role === 'system_admin', persisted.role);
            return true;
          }
          return false;
        }
      },
    }),
    { name: 'auth-storage', storage: createJSONStorage(() => AsyncStorage) }
  )
);
