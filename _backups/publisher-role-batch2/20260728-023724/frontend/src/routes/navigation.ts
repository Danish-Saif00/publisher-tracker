import type { CompanyRole, PlatformRole } from "../features/auth/auth.types";

export type NavigationAudience =
  | "all-authenticated"
  | "platform-admin"
  | "company-admin"
  | "manager"
  | "publisher"
  | "company-member";

export type NavigationLeaf = {
  label: string;
  path: string;
  icon: string;
  audience: NavigationAudience;
};

export type NavigationItem = NavigationLeaf & {
  children?: readonly NavigationLeaf[];
};

export type NavigationGroup = {
  label: string;
  items: readonly NavigationItem[];
};

const platformGroups: readonly NavigationGroup[] = [
  {
    label: "Platform",
    items: [
      {
        label: "Dashboard",
        path: "/dashboard",
        icon: "dashboard",
        audience: "platform-admin",
      },
      {
        label: "Companies",
        path: "/companies",
        icon: "business",
        audience: "platform-admin",
      },
      {
        label: "Company Admins",
        path: "/company-admins",
        icon: "admin_panel_settings",
        audience: "platform-admin",
      },
      {
        label: "Billing",
        path: "/billing",
        icon: "payments",
        audience: "platform-admin",
      },
      {
        label: "My Profile",
        path: "/account",
        icon: "manage_accounts",
        audience: "platform-admin",
      },
    ],
  },
];

const companyAdminGroups: readonly NavigationGroup[] = [
  {
    label: "Operations",
    items: [
      {
        label: "Dashboard",
        path: "/dashboard",
        icon: "dashboard",
        audience: "company-admin",
      },
      {
        label: "Domains",
        path: "/domains/manage",
        icon: "dns",
        audience: "company-admin",
        children: [
          {
            label: "Add Domain",
            path: "/domains/add",
            icon: "add_circle",
            audience: "company-admin",
          },
          {
            label: "Manage Domains",
            path: "/domains/manage",
            icon: "dns",
            audience: "company-admin",
          },
        ],
      },
      {
        label: "Networks",
        path: "/networks/manage",
        icon: "account_tree",
        audience: "company-admin",
        children: [
          {
            label: "Add Network",
            path: "/networks/add",
            icon: "add_circle",
            audience: "company-admin",
          },
          {
            label: "Manage Networks",
            path: "/networks/manage",
            icon: "account_tree",
            audience: "company-admin",
          },
        ],
      },
      {
        label: "Offers",
        path: "/offers/manage",
        icon: "local_offer",
        audience: "company-admin",
        children: [
          {
            label: "Add Offer",
            path: "/offers/add",
            icon: "add_circle",
            audience: "company-admin",
          },
          {
            label: "Manage Offers",
            path: "/offers/manage",
            icon: "local_offer",
            audience: "company-admin",
          },
        ],
      },
      {
        label: "Managers",
        path: "/managers/manage",
        icon: "supervisor_account",
        audience: "company-admin",
        children: [
          {
            label: "Add Manager",
            path: "/managers/add",
            icon: "person_add",
            audience: "company-admin",
          },
          {
            label: "Manage Managers",
            path: "/managers/manage",
            icon: "manage_accounts",
            audience: "company-admin",
          },
        ],
      },
      {
        label: "Reports",
        path: "/reports/networks",
        icon: "analytics",
        audience: "company-admin",
        children: [
          {
            label: "Networks",
            path: "/reports/networks",
            icon: "account_tree",
            audience: "company-admin",
          },
          {
            label: "Offers",
            path: "/reports/offers",
            icon: "local_offer",
            audience: "company-admin",
          },
          {
            label: "Managers",
            path: "/reports/managers",
            icon: "supervisor_account",
            audience: "company-admin",
          },
        ],
      },
      {
        label: "Logs",
        path: "/logs/clicks",
        icon: "database",
        audience: "company-admin",
        children: [
          {
            label: "Clicks",
            path: "/logs/clicks",
            icon: "ads_click",
            audience: "company-admin",
          },
          {
            label: "Conversions",
            path: "/logs/conversions",
            icon: "sync_alt",
            audience: "company-admin",
          },
          {
            label: "Sessions",
            path: "/logs/sessions",
            icon: "history",
            audience: "company-admin",
          },
          {
            label: "User Agents",
            path: "/logs/user-agents",
            icon: "text_snippet",
            audience: "company-admin",
          },
        ],
      },
    ],
  },
  {
    label: "Settings",
    items: [
      {
        label: "Customize",
        path: "/settings",
        icon: "tune",
        audience: "company-admin",
      },
      {
        label: "Account",
        path: "/account",
        icon: "manage_accounts",
        audience: "company-admin",
      },
      {
        label: "Billing",
        path: "/billing",
        icon: "payments",
        audience: "company-admin",
      },
    ],
  },
];

const managerGroups: readonly NavigationGroup[] = [
  {
    label: "Operations",
    items: [
      {
        label: "Dashboard",
        path: "/dashboard",
        icon: "dashboard",
        audience: "manager",
      },
      {
        label: "Assigned Offers",
        path: "/offers/manage",
        icon: "local_offer",
        audience: "manager",
      },
      {
        label: "Publishers",
        path: "/publishers",
        icon: "group",
        audience: "manager",
      },
      {
        label: "Reports",
        path: "/reports/offers",
        icon: "analytics",
        audience: "manager",
        children: [
          {
            label: "Offers",
            path: "/reports/offers",
            icon: "local_offer",
            audience: "manager",
          },
          {
            label: "Publishers",
            path: "/reports/publishers",
            icon: "group",
            audience: "manager",
          },
        ],
      },
      {
        label: "Logs",
        path: "/logs/clicks",
        icon: "database",
        audience: "manager",
        children: [
          {
            label: "Clicks",
            path: "/logs/clicks",
            icon: "ads_click",
            audience: "manager",
          },
          {
            label: "Conversions",
            path: "/logs/conversions",
            icon: "sync_alt",
            audience: "manager",
          },
          {
            label: "Sessions",
            path: "/logs/sessions",
            icon: "history",
            audience: "manager",
          },
          {
            label: "User Agents",
            path: "/logs/user-agents",
            icon: "text_snippet",
            audience: "manager",
          },
        ],
      },
    ],
  },
  {
    label: "Settings",
    items: [
      {
        label: "Account",
        path: "/account",
        icon: "manage_accounts",
        audience: "manager",
      },
    ],
  },
];

const publisherGroups: readonly NavigationGroup[] = [
  {
    label: "Publisher",
    items: [
      {
        label: "Dashboard",
        path: "/dashboard",
        icon: "dashboard",
        audience: "publisher",
      },
      {
        label: "Assigned Offers",
        path: "/offers/manage",
        icon: "local_offer",
        audience: "publisher",
      },
      {
        label: "Tracking Links",
        path: "/tracking-links",
        icon: "link",
        audience: "publisher",
      },
      {
        label: "Reports",
        path: "/reports/offers",
        icon: "analytics",
        audience: "publisher",
      },
      {
        label: "Account",
        path: "/account",
        icon: "manage_accounts",
        audience: "publisher",
      },
    ],
  },
];

export function canViewNavigationItem(
  audience: NavigationAudience,
  platformRole: PlatformRole | null,
  companyRole: CompanyRole | null,
  membershipStatus: string | null,
): boolean {
  const platformAdmin = platformRole === "platform_super_admin";
  const activeMember = membershipStatus === "active" && companyRole !== null;

  switch (audience) {
    case "all-authenticated":
      return platformAdmin || activeMember;
    case "platform-admin":
      return platformAdmin;
    case "company-admin":
      return !platformAdmin && activeMember && companyRole === "company_admin";
    case "manager":
      return !platformAdmin && activeMember && companyRole === "manager";
    case "publisher":
      return !platformAdmin && activeMember && companyRole === "publisher";
    case "company-member":
      return !platformAdmin && activeMember;
  }
}

export function resolveNavigationGroups(
  platformRole: PlatformRole | null,
  companyRole: CompanyRole | null,
  membershipStatus: string | null,
): readonly NavigationGroup[] {
  if (platformRole === "platform_super_admin") {
    return platformGroups;
  }

  if (membershipStatus !== "active") {
    return [];
  }

  switch (companyRole) {
    case "company_admin":
      return companyAdminGroups;
    case "manager":
      return managerGroups;
    case "publisher":
      return publisherGroups;
    default:
      return [];
  }
}
