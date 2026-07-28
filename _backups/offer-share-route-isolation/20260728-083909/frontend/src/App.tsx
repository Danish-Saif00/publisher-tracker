import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router";

import { AppShell } from "./components/layout/app-shell";
import { ProtectedRoute } from "./features/auth/protected-route";
import { PublicOnlyRoute } from "./features/auth/public-only-route";
import { AcceptInvitationPage } from "./pages/invitations/accept-invitation-page";
import { ModulePlaceholderPage } from "./pages/shared/module-placeholder-page";

const AccountPage = lazy(async () => ({
  default: (await import("./pages/account/account-page")).AccountPage,
}));
const BillingPage = lazy(async () => ({
  default: (await import("./pages/billing/billing-page")).BillingPage,
}));
const CompaniesPage = lazy(async () => ({
  default: (await import("./pages/companies/companies-page")).CompaniesPage,
}));
const ClicksPage = lazy(async () => ({
  default: (await import("./pages/logs/role-aware-clicks-page")).ClicksPage,
}));
const ConversionsPage = lazy(async () => ({
  default: (await import("./pages/conversions/role-aware-conversions-page"))
    .ConversionsPage,
}));
const DashboardPage = lazy(async () => ({
  default: (await import("./pages/dashboard/dashboard-page")).DashboardPage,
}));
const FraudReviewPage = lazy(async () => ({
  default: (await import("./pages/fraud-review/fraud-review-page"))
    .FraudReviewPage,
}));
const ForgotPasswordPage = lazy(async () => ({
  default: (await import("./pages/auth/forgot-password-page"))
    .ForgotPasswordPage,
}));
const LoginPage = lazy(async () => ({
  default: (await import("./pages/auth/login-page")).LoginPage,
}));
const NetworkAccountsPage = lazy(async () => ({
  default: (await import("./pages/network-accounts/network-accounts-page"))
    .NetworkAccountsPage,
}));
const ManagersPage = lazy(async () => ({
  default: (await import("./pages/managers/managers-page")).ManagersPage,
}));
const NetworkProvidersPage = lazy(async () => ({
  default: (await import("./pages/network-providers/network-providers-page"))
    .NetworkProvidersPage,
}));
const RoleAwareOffersPage = lazy(async () => ({
  default: (await import("./pages/offers/role-aware-offers-page"))
    .RoleAwareOffersPage,
}));
const OperationsPage = lazy(async () => ({
  default: (await import("./pages/operations/operations-page")).OperationsPage,
}));
const PayoutsPage = lazy(async () => ({
  default: (await import("./pages/payouts/payouts-page")).PayoutsPage,
}));
const PostbacksPage = lazy(async () => ({
  default: (await import("./pages/postbacks/postbacks-page")).PostbacksPage,
}));
const PublishersPage = lazy(async () => ({
  default: (await import("./pages/publishers/publishers-page")).PublishersPage,
}));
const ReportsPage = lazy(async () => ({
  default: (await import("./pages/reports/role-aware-reports-page"))
    .ReportsPage,
}));
const SessionsPage = lazy(async () => ({
  default: (await import("./pages/logs/role-aware-sessions-page")).SessionsPage,
}));
const SettingsPage = lazy(async () => ({
  default: (await import("./pages/settings/settings-page")).SettingsPage,
}));
const TenantAdministrationPage = lazy(async () => ({
  default: (
    await import("./pages/tenant-administration/tenant-administration-page")
  ).TenantAdministrationPage,
}));
const TrackingDomainsPage = lazy(async () => ({
  default: (await import("./pages/tracking-domains/tracking-domains-page"))
    .TrackingDomainsPage,
}));
const TrackingLinksPage = lazy(async () => ({
  default: (
    await import("./pages/tracking-links/role-aware-tracking-links-page")
  ).TrackingLinksPage,
}));
const UserAgentsPage = lazy(async () => ({
  default: (await import("./pages/logs/role-aware-user-agents-page"))
    .UserAgentsPage,
}));
const UpdatePasswordPage = lazy(async () => ({
  default: (await import("./pages/auth/update-password-page"))
    .UpdatePasswordPage,
}));

function RouteLoading() {
  return <div className="route-loading">Loading Publisher Tracker...</div>;
}

function LazyRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteLoading />}>{children}</Suspense>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate replace to="/dashboard" />} />

      <Route element={<PublicOnlyRoute />}>
        <Route
          path="/login"
          element={
            <LazyRoute>
              <LoginPage />
            </LazyRoute>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <LazyRoute>
              <ForgotPasswordPage />
            </LazyRoute>
          }
        />
      </Route>

      <Route
        path="/update-password"
        element={
          <LazyRoute>
            <UpdatePasswordPage />
          </LazyRoute>
        }
      />

      <Route element={<ProtectedRoute />}>
        <Route path="accept-invitation" element={<AcceptInvitationPage />} />

        <Route element={<AppShell />}>
          <Route
            path="dashboard"
            element={
              <LazyRoute>
                <DashboardPage />
              </LazyRoute>
            }
          />
          <Route
            path="companies"
            element={
              <LazyRoute>
                <CompaniesPage />
              </LazyRoute>
            }
          />
          <Route
            path="billing"
            element={
              <LazyRoute>
                <BillingPage />
              </LazyRoute>
            }
          />
          <Route
            path="company-admins"
            element={
              <LazyRoute>
                <TenantAdministrationPage />
              </LazyRoute>
            }
          />
          <Route
            path="tenant-administration"
            element={
              <LazyRoute>
                <TenantAdministrationPage />
              </LazyRoute>
            }
          />
          <Route
            path="tracking-domains"
            element={<Navigate replace to="/domains/manage" />}
          />
          <Route
            path="domains/add"
            element={
              <LazyRoute>
                <TrackingDomainsPage mode="add" />
              </LazyRoute>
            }
          />
          <Route
            path="domains/manage"
            element={
              <LazyRoute>
                <TrackingDomainsPage mode="manage" />
              </LazyRoute>
            }
          />
          <Route
            path="network-providers"
            element={
              <LazyRoute>
                <NetworkProvidersPage />
              </LazyRoute>
            }
          />
          <Route
            path="network-accounts"
            element={<Navigate replace to="/networks/manage" />}
          />
          <Route
            path="networks/add"
            element={
              <LazyRoute>
                <NetworkAccountsPage mode="add" />
              </LazyRoute>
            }
          />
          <Route
            path="networks/manage"
            element={
              <LazyRoute>
                <NetworkAccountsPage mode="manage" />
              </LazyRoute>
            }
          />
          <Route
            path="offers"
            element={<Navigate replace to="/offers/manage" />}
          />
          <Route
            path="offers/add"
            element={
              <LazyRoute>
                <RoleAwareOffersPage mode="add" />
              </LazyRoute>
            }
          />
          <Route
            path="offers/manage"
            element={
              <LazyRoute>
                <RoleAwareOffersPage mode="manage" />
              </LazyRoute>
            }
          />
          <Route
            path="managers/add"
            element={
              <LazyRoute>
                <ManagersPage mode="add" />
              </LazyRoute>
            }
          />
          <Route
            path="managers/manage"
            element={
              <LazyRoute>
                <ManagersPage mode="manage" />
              </LazyRoute>
            }
          />
          <Route
            path="publishers"
            element={
              <LazyRoute>
                <PublishersPage />
              </LazyRoute>
            }
          />
          <Route
            path="tracking-links"
            element={
              <LazyRoute>
                <TrackingLinksPage />
              </LazyRoute>
            }
          />
          <Route
            path="payouts"
            element={
              <LazyRoute>
                <PayoutsPage />
              </LazyRoute>
            }
          />
          <Route
            path="conversions"
            element={<Navigate replace to="/logs/conversions" />}
          />
          <Route
            path="postbacks"
            element={
              <LazyRoute>
                <PostbacksPage />
              </LazyRoute>
            }
          />
          <Route
            path="fraud-review"
            element={
              <LazyRoute>
                <FraudReviewPage />
              </LazyRoute>
            }
          />
          <Route
            path="reports"
            element={<Navigate replace to="/reports/networks" />}
          />
          <Route
            path="reports/networks"
            element={
              <LazyRoute>
                <ReportsPage dimension="networks" />
              </LazyRoute>
            }
          />
          <Route
            path="reports/offers"
            element={
              <LazyRoute>
                <ReportsPage dimension="offers" />
              </LazyRoute>
            }
          />
          <Route
            path="reports/managers"
            element={
              <LazyRoute>
                <ReportsPage dimension="managers" />
              </LazyRoute>
            }
          />
          <Route
            path="reports/publishers"
            element={
              <LazyRoute>
                <ReportsPage dimension="publishers" />
              </LazyRoute>
            }
          />
          <Route
            path="logs/clicks"
            element={
              <LazyRoute>
                <ClicksPage />
              </LazyRoute>
            }
          />
          <Route
            path="logs/conversions"
            element={
              <LazyRoute>
                <ConversionsPage />
              </LazyRoute>
            }
          />
          <Route
            path="logs/sessions"
            element={
              <LazyRoute>
                <SessionsPage />
              </LazyRoute>
            }
          />
          <Route
            path="logs/user-agents"
            element={
              <LazyRoute>
                <UserAgentsPage />
              </LazyRoute>
            }
          />
          <Route
            path="operations"
            element={
              <LazyRoute>
                <OperationsPage />
              </LazyRoute>
            }
          />
          <Route
            path="settings"
            element={
              <LazyRoute>
                <SettingsPage />
              </LazyRoute>
            }
          />
          <Route
            path="account"
            element={
              <LazyRoute>
                <AccountPage />
              </LazyRoute>
            }
          />
          <Route
            path="companies/:companyId"
            element={<ModulePlaceholderPage />}
          />
          <Route
            path="offers/:offerId"
            element={<Navigate replace to="/offers/manage" />}
          />
        </Route>
      </Route>

      <Route path="*" element={<Navigate replace to="/dashboard" />} />
    </Routes>
  );
}
