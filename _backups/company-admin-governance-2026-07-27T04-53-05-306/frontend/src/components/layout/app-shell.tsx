import { useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';

import { useAuth } from '../../features/auth/use-auth';
import { useCompany } from '../../features/companies/use-company';
import { SubscriptionAccessPage } from '../../pages/billing/subscription-access-page';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

const PLATFORM_ROUTE_PREFIXES = [
  '/dashboard',
  '/companies',
  '/company-admins',
  '/billing',
  '/account',
] as const;

function isPlatformRouteAllowed(pathname: string): boolean {
  return PLATFORM_ROUTE_PREFIXES.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export function AppShell() {
  const auth = useAuth();
  const company = useCompany();
  const location = useLocation();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const platformAdmin =
    auth.identity?.authorization.platformRole === 'platform_super_admin';

  if (platformAdmin && !isPlatformRouteAllowed(location.pathname)) {
    return <Navigate replace to="/dashboard" />;
  }

  const companyAccessRestricted =
    !platformAdmin && company.accessRestriction !== null;
  const showRestriction =
    companyAccessRestricted && location.pathname !== '/account';

  return (
    <div className="app-shell">
      <div className="ambient-orb ambient-orb--violet" />
      <div className="ambient-orb ambient-orb--blue" />

      <Sidebar open={navigationOpen} onClose={() => setNavigationOpen(false)} />
      <Topbar onOpenNavigation={() => setNavigationOpen(true)} />

      <main className="app-content">
        {showRestriction ? <SubscriptionAccessPage /> : <Outlet />}
      </main>
    </div>
  );
}
