import type { CompanyRole, PlatformRole } from '../features/auth/auth.types';

export type NavigationAudience =
  | 'all-authenticated'
  | 'platform-admin'
  | 'company-admin-or-platform'
  | 'operations-team'
  | 'company-member';

export type NavigationItem = {
  label: string;
  path: string;
  icon: string;
  audience: NavigationAudience;
};

export type NavigationGroup = {
  label: string;
  items: readonly NavigationItem[];
};

export const navigationGroups: readonly NavigationGroup[] = [
  {
    label: 'Platform',
    items: [
      { label: 'Dashboard', path: '/dashboard', icon: 'dashboard', audience: 'all-authenticated' },
      { label: 'Companies', path: '/companies', icon: 'business', audience: 'platform-admin' },
      { label: 'Billing', path: '/billing', icon: 'payments', audience: 'company-admin-or-platform' },
      { label: 'Tenant Administration', path: '/tenant-administration', icon: 'admin_panel_settings', audience: 'operations-team' },
      { label: 'Network Providers', path: '/network-providers', icon: 'hub', audience: 'platform-admin' },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { label: 'Domains', path: '/tracking-domains', icon: 'dns', audience: 'operations-team' },
      { label: 'Networks', path: '/network-accounts', icon: 'account_tree', audience: 'operations-team' },
      { label: 'Offers', path: '/offers', icon: 'local_offer', audience: 'operations-team' },
      { label: 'Publishers', path: '/publishers', icon: 'group', audience: 'operations-team' },
    ],
  },
  {
    label: 'Attribution',
    items: [
      { label: 'Tracking Links', path: '/tracking-links', icon: 'link', audience: 'company-member' },
      { label: 'Payouts', path: '/payouts', icon: 'account_balance_wallet', audience: 'company-member' },
      { label: 'Postbacks', path: '/postbacks', icon: 'webhook', audience: 'operations-team' },
      { label: 'Fraud Review', path: '/fraud-review', icon: 'gpp_bad', audience: 'operations-team' },
      { label: 'Operations', path: '/operations', icon: 'monitor_heart', audience: 'operations-team' },
    ],
  },
  {
    label: 'Reports',
    items: [
      { label: 'Networks Report', path: '/reports/networks', icon: 'account_tree', audience: 'company-member' },
      { label: 'Offers Report', path: '/reports/offers', icon: 'local_offer', audience: 'company-member' },
      { label: 'Publishers Report', path: '/reports/publishers', icon: 'group', audience: 'company-member' },
    ],
  },
  {
    label: 'Logs',
    items: [
      { label: 'Clicks', path: '/logs/clicks', icon: 'ads_click', audience: 'company-member' },
      { label: 'Conversions', path: '/logs/conversions', icon: 'sync_alt', audience: 'company-member' },
      { label: 'Sessions', path: '/logs/sessions', icon: 'history', audience: 'company-member' },
      { label: 'User Agents', path: '/logs/user-agents', icon: 'text_snippet', audience: 'company-member' },
    ],
  },
] as const;

export function canViewNavigationItem(
  audience: NavigationAudience,
  platformRole: PlatformRole | null,
  companyRole: CompanyRole | null,
  membershipStatus: string | null,
): boolean {
  const platformAdmin = platformRole === 'platform_super_admin';
  const activeMember = membershipStatus === 'active' && companyRole !== null;

  switch (audience) {
    case 'all-authenticated':
      return true;
    case 'platform-admin':
      return platformAdmin;
    case 'company-admin-or-platform':
      return platformAdmin || (activeMember && companyRole === 'company_admin');
    case 'operations-team':
      return (
        platformAdmin ||
        (activeMember && (companyRole === 'company_admin' || companyRole === 'manager'))
      );
    case 'company-member':
      return platformAdmin || activeMember;
  }
}
