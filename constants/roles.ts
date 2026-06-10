export type UserRole = 'admin' | 'cashier' | 'system_admin';
export const ROLES = {
  ADMIN: 'admin' as UserRole,
  CASHIER: 'cashier' as UserRole,
  SYSTEM_ADMIN: 'system_admin' as UserRole,
} as const;

// system_admin > admin > cashier
const ROLE_HIERARCHY: Record<UserRole, number> = { system_admin: 3, admin: 2, cashier: 1 };

export function hasMinimumRole(userRole: UserRole | null, requiredRole: UserRole): boolean {
  if (!userRole) return false;
  return (ROLE_HIERARCHY[userRole] ?? 0) >= ROLE_HIERARCHY[requiredRole];
}
