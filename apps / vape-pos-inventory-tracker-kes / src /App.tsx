import { useEffect, useState, ReactElement } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth, logout } from 'zitejs/auth';
import { Toaster } from '@project/components/ui/sonner';
import { Button } from '@project/components/ui/button';
import { ShieldAlert } from 'lucide-react';
import AppLayout from './components/AppLayout';
import DashboardPage from './pages/DashboardPage';
import POSPage from './pages/POSPage';
import InventoryPage from './pages/InventoryPage';
import CustomersPage from './pages/CustomersPage';
import SuppliersPage from './pages/SuppliersPage';
import SalesPage from './pages/SalesPage';
import PurchasesPage from './pages/PurchasesPage';
import PurchaseOrdersPage from './pages/PurchaseOrdersPage';
import ExpensesPage from './pages/ExpensesPage';
import SettingsPage from './pages/SettingsPage';
import CategoriesPage from './pages/CategoriesPage';
import UsersPage from './pages/UsersPage';
import AddressesPage from './pages/AddressesPage';
import LandingPage from './pages/LandingPage';
import { PermissionsProvider, usePermissions } from './hooks/usePermissions';

// Each screen belongs to a permission "area" (see the roles matrix on the Users page).
const ROUTES: { path: string; area: string; element: ReactElement }[] = [
  { path: '/', area: 'reports', element: <DashboardPage /> },
  { path: '/pos', area: 'pos', element: <POSPage /> },
  { path: '/inventory', area: 'inventory', element: <InventoryPage /> },
  { path: '/sales', area: 'pos', element: <SalesPage /> },
  { path: '/purchases', area: 'purchases', element: <PurchasesPage /> },
  { path: '/purchase-orders', area: 'purchases', element: <PurchaseOrdersPage /> },
  { path: '/expenses', area: 'expenses', element: <ExpensesPage /> },
  { path: '/customers', area: 'customers', element: <CustomersPage /> },
  { path: '/suppliers', area: 'suppliers', element: <SuppliersPage /> },
  { path: '/categories', area: 'inventory', element: <CategoriesPage /> },
  { path: '/addresses', area: 'pos', element: <AddressesPage /> },
  { path: '/users', area: 'users', element: <UsersPage /> },
  { path: '/settings', area: 'settings', element: <SettingsPage /> },
];

function AccessPending() {
  const { roleName, refresh, loading } = usePermissions();
  const { user } = useAuth();
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-card border border-border rounded-xl p-8 text-center space-y-4">
        <ShieldAlert className="w-12 h-12 mx-auto text-secondary" />
        <h1 className="text-xl font-bold text-foreground">Waiting for access</h1>
        <p className="text-sm text-muted-foreground break-words">
          You are signed in as <span className="font-medium text-foreground break-all">{user?.email}</span>, but no
          role has been assigned to this account yet{roleName && roleName !== 'No role assigned' ? ` (current role: ${roleName})` : ''}.
          Please ask an administrator to assign you a role on the Users page, then check again.
        </p>
        <div className="flex gap-2 justify-center flex-wrap">
          <Button onClick={() => refresh()} disabled={loading}>{loading ? 'Checking...' : 'Check again'}</Button>
          <Button variant="outline" onClick={() => logout()}>Sign out</Button>
        </div>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { can, pending, loading } = usePermissions();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">Checking your access...</p>
        </div>
      </div>
    );
  }

  const visible = ROUTES.filter(r => can(r.area, 'view'));
  if (pending || visible.length === 0) return <AccessPending />;

  const home = visible[0].path;

  return (
    <AppLayout>
      <Routes>
        {ROUTES.map(r => (
          <Route
            key={r.path}
            path={r.path}
            element={can(r.area, 'view') ? r.element : <Navigate to={home} replace />}
          />
        ))}
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </AppLayout>
  );
}

export default function App() {
  const { user, isLoading } = useAuth();
  const [showLanding, setShowLanding] = useState(true);

  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  useEffect(() => {
    if (!isLoading && user) {
      setShowLanding(false);
    }
  }, [isLoading, user]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || showLanding) {
    return (
      <>
        <LandingPage />
        <Toaster />
      </>
    );
  }

  return (
    <BrowserRouter>
      <PermissionsProvider>
        <AppRoutes />
      </PermissionsProvider>
      <Toaster />
    </BrowserRouter>
  );
}
