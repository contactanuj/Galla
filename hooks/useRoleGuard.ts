import { useAuthStore } from '../store/authStore';
import type { UserRole } from '../constants/roles';
import { hasMinimumRole } from '../constants/roles';

export function useRoleGuard(requiredRole: UserRole) {
  const role = useAuthStore((state) => state.role);
  return {
    hasAccess: hasMinimumRole(role, requiredRole),
    isAdmin: role === 'admin' || role === 'system_admin',
    isSystemAdmin: role === 'system_admin',
  };
}

export function useIsAdmin() {
  const role = useAuthStore((state) => state.role);
  return role === 'admin' || role === 'system_admin';
}

export function useIsSystemAdmin() {
  const role = useAuthStore((state) => state.role);
  return role === 'system_admin';
}
