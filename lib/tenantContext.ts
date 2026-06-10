/**
 * Module-level singleton so repository functions can read the current
 * tenant ID without React hooks or prop drilling.
 * Set once in authStore after successful login; cleared on logout.
 */

let _tenantId: string | null = null;
let _systemAdmin = false;
let _role: string | null = null;

export function setCurrentTenant(tenantId: string | null, isSystemAdmin: boolean, role?: string | null): void {
  _tenantId = tenantId;
  _systemAdmin = isSystemAdmin;
  _role = role ?? (isSystemAdmin ? 'system_admin' : null);
}

/** Returns the current tenant ID, or null for system_admin (sees everything). */
export function getTenantId(): string | null {
  return _tenantId;
}

/** True when the logged-in user is a system_admin (no tenant scoping). */
export function currentUserIsSystemAdmin(): boolean {
  return _systemAdmin;
}

/** The current user's role ('admin' | 'cashier' | 'system_admin'), or null. */
export function currentUserRole(): string | null {
  return _role;
}

/** True for admin or system_admin — i.e. may see cost price and manage data. */
export function currentUserIsAdmin(): boolean {
  return _role === 'admin' || _role === 'system_admin';
}
