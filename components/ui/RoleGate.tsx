import { useRoleGuard } from '../../hooks/useRoleGuard';
import type { UserRole } from '../../constants/roles';

export default function RoleGate({ role, children }: { role: UserRole; children: React.ReactNode }) {
  const { hasAccess } = useRoleGuard(role);
  if (!hasAccess) return null;
  return <>{children}</>;
}
