import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { PageSkeleton } from "@/components/layout/loading-skeleton";

// Lazy-loaded route pages for code splitting
const WelcomePage = lazy(() => import("@/features/auth/welcome-page"));
const DashboardPage = lazy(() => import("@/features/dashboard/dashboard-page"));
const ExpensesPage = lazy(() => import("@/features/expenses/expenses-page"));
const ExpenseNewPage = lazy(() => import("@/features/expenses/expense-new-page"));
const ExpenseForm = lazy(() => import("@/features/expenses/expense-form"));
const ExpenseDetailPage = lazy(() => import("@/features/expenses/expense-detail-page"));
const GroupsPage = lazy(() => import("@/features/groups/groups-page"));
const GroupNewPage = lazy(() => import("@/features/groups/group-new-page"));
const GroupDetailPage = lazy(() => import("@/features/groups/group-detail-page"));
const FriendsPage = lazy(() => import("@/features/friends/friends-page"));
const SettlementsPage = lazy(() => import("@/features/settlements/settlements-page"));
const SettlementNewPage = lazy(() => import("@/features/settlements/settlement-new-page"));
const ReportsPage = lazy(() => import("@/features/reports/reports-page"));
const SettingsPage = lazy(() => import("@/features/settings/settings-page"));
const NotFoundPage = lazy(() => import("@/features/not-found/not-found-page"));

export function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageSkeleton />}>
        <Routes>
          {/* Default redirect: / -> /dashboard */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* Standalone onboarding welcome page */}
          <Route path="/welcome" element={<WelcomePage />} />

          {/* Main App Layout shell for core features */}
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<DashboardPage />} />

            {/* Expenses */}
            <Route path="/expenses" element={<ExpensesPage />} />
            <Route path="/expenses/new" element={<ExpenseForm />} />
            <Route path="/expenses/:id" element={<ExpenseDetailPage />} />
            <Route path="/expenses/:id/edit" element={<ExpenseForm />} />

            {/* Groups & Sub-routes */}
            <Route path="/groups" element={<GroupsPage />} />
            <Route path="/groups/new" element={<GroupNewPage />} />
            <Route path="/groups/:groupId" element={<GroupDetailPage />} />
            <Route path="/groups/:groupId/:tab" element={<GroupDetailPage />} />

            {/* Friends */}
            <Route path="/friends" element={<FriendsPage />} />

            {/* Settlements & Activity */}
            <Route path="/settlements" element={<SettlementsPage />} />
            <Route path="/settlements/new" element={<SettlementNewPage />} />
            <Route path="/activity" element={<Navigate to="/settlements" replace />} />

            {/* Reports */}
            <Route path="/reports" element={<ReportsPage />} />

            {/* Settings */}
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          {/* 404 Catch-All */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default AppRouter;
