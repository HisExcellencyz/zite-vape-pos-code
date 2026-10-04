import { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth, logout } from 'zitejs/auth';
import { syncToGoogleSheets } from 'zitejs/api';
import {
  LayoutDashboard, ShoppingCart, Package, Users, Truck,
  Receipt, Settings, LogOut, ChevronLeft, ChevronRight,
  Wallet, MapPin, Store, Check, Sun, Moon, FileSpreadsheet, Loader2
} from 'lucide-react';
import { cn } from '@project/components/lib/utils';
import { Button } from '@project/components/ui/button';
import { Avatar, AvatarFallback } from '@project/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel
} from '@project/components/ui/dropdown-menu';
import { useState } from 'react';
import { toast } from 'sonner';
import { usePermissions } from '../hooks/usePermissions';
import { useBranch } from '../hooks/useBranch';
import { useTheme } from '../hooks/useTheme';

const DEFAULT_LOGO = 'https://images.fillout.com/orgid-811092/flowpublicid-6hepsbbapu/widgetid-default/xmArbfbmsBwLWSE2d2Et7u/pasted-image-1788367385543-n4ulma8b.png';

// `area` links each menu item to the permission matrix on the Users page.
// `alt` is an extra area that also shows the item.
const navItems: { to: string; icon: any; label: string; area: string; alt?: string }[] = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', area: 'reports' },
  { to: '/pos', icon: ShoppingCart, label: 'POS', area: 'pos' },
  { to: '/inventory', icon: Package, label: 'Inventory', area: 'inventory' },
  { to: '/income', icon: Receipt, label: 'Income', area: 'pos' },
  { to: '/expenses', icon: Wallet, label: 'Expenses', area: 'expenses', alt: 'purchases' },
  { to: '/customers', icon: Users, label: 'Customers', area: 'customers' },
  { to: '/suppliers', icon: Truck, label: 'Suppliers', area: 'suppliers' },
  { to: '/addresses', icon: MapPin, label: 'Addresses', area: 'pos' },
  { to: '/settings', icon: Settings, label: 'Settings', area: 'settings' },
];

const TONES: Record<string, string> = { '/pos': 'blue', '/inventory': 'blue', '/income': 'blue', '/customers': 'blue', '/expenses': 'pink', '/suppliers': 'pink' };
const toneFor = (path: string) => TONES['/' + (path.split('/')[1] || '')] || 'gold';

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { can, roleName } = usePermissions();
  const { branches, currentBranch, setCurrentBranchId } = useBranch();
  const [collapsed, setCollapsed] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const { theme, toggle } = useTheme();
  const location = useLocation();

  const visibleItems = navItems.filter(item => can(item.area, 'view') || (!!item.alt && can(item.alt, 'view')));
  const outletLogo = currentBranch?.logoUrl || DEFAULT_LOGO;
  const outletName = currentBranch?.branchName || 'Uptown Vapes';
  const canArchive = can('settings', 'view');

  const handleArchive = async () => {
    if (archiving) return;
    if (!window.confirm('Archive all data to Google Sheets now? Sales, purchases, expenses and income older than 3 months will be removed from the app after the archive.')) return;
    setArchiving(true);
    try {
      const res = await syncToGoogleSheets({});
      toast.success(res.message);
    } catch (e: any) {
      toast.error(e.message || 'Archive failed');
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="h-screen overflow-hidden bg-background flex">
      {/* Sidebar */}
      <aside
        className={cn(
          'h-screen sticky top-0 flex flex-col border-r border-border bg-card transition-all duration-200',
          collapsed ? 'w-16' : 'w-60'
        )}
      >
        {/* Outlet switcher */}
        <div className="px-3 py-4 border-b border-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn('flex items-center gap-3 w-full rounded-lg p-1 hover:bg-muted transition-colors', collapsed && 'justify-center')}>
                <img src={outletLogo} alt={outletName} className="w-9 h-9 rounded-lg object-cover shrink-0" />
                {!collapsed && (
                  <div className="text-left min-w-0 flex-1">
                    <span className="text-sm font-bold text-foreground truncate block">{outletName}</span>
                    {branches.length > 1 && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Store className="w-3 h-3" /> Switch outlet
                      </span>
                    )}
                  </div>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>Outlets</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {branches.map(b => (
                <DropdownMenuItem key={b.id} onClick={() => setCurrentBranchId(b.id)} className="gap-2">
                  <img src={b.logoUrl || DEFAULT_LOGO} alt={b.branchName} className="w-6 h-6 rounded object-cover shrink-0" />
                  <span className="flex-1 truncate">{b.branchName}</span>
                  {b.id === currentBranch?.id && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                </DropdownMenuItem>
              ))}
              {can('settings', 'view') && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <NavLink to="/settings" className="gap-2">
                      <Settings className="w-4 h-4" /> Manage Outlets
                    </NavLink>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Profile */}
        <div className="px-3 py-3 border-b border-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn('flex items-center gap-2 w-full rounded-lg p-1.5 hover:bg-muted transition-colors', collapsed && 'justify-center')}>
                <Avatar className="w-8 h-8">
                  <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
                    {(user?.firstName?.[0] || user?.email?.[0] || 'U').toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {!collapsed && (
                  <div className="text-left overflow-hidden">
                    <p className="text-xs font-medium text-foreground truncate">{user?.firstName || user?.email}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
                    {roleName && <p className="text-[10px] text-primary truncate">{roleName}</p>}
                  </div>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem onClick={() => logout()} className="text-destructive">
                <LogOut className="w-4 h-4 mr-2" /> Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {visibleItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              data-tone={toneFor(item.to)}
              className={({ isActive }) =>
                cn(
                  'tone-nav flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive ? 'is-active' : 'text-muted-foreground',
                  collapsed && 'justify-center px-2'
                )
              }
            >
              <item.icon className="w-4.5 h-4.5 shrink-0" />
              {!collapsed && item.label}
            </NavLink>
          ))}
        </nav>

        {/* Bottom row: theme icon (far left), Archive Now (middle), collapse icon (far right) */}
        <div className={cn('px-2 py-3 border-t border-border flex gap-1', collapsed ? 'flex-col items-center' : 'flex-row items-center')}>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            className="gold-btn h-8 w-8 shrink-0"
            title="Toggle light / dark mode"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>

          {canArchive && (
            collapsed ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleArchive}
                disabled={archiving}
                className="h-8 w-8 shrink-0 bg-sky-300 text-slate-900 hover:bg-sky-400 hover:text-slate-900"
                title="Archive Now (to Google Sheets)"
              >
                {archiving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              </Button>
            ) : (
              <Button
                variant="default"
                size="sm"
                onClick={handleArchive}
                disabled={archiving}
                className="h-8 flex-1 min-w-0 text-xs px-2 border border-sky-300 bg-sky-300 text-slate-900 shadow-none hover:bg-sky-400 hover:text-slate-900"
                title="Copy all data to your Google Sheet; transactions older than 3 months are then removed from the app"
              >
                {archiving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin shrink-0" /> : <FileSpreadsheet className="w-3.5 h-3.5 mr-1 shrink-0" />}
                <span className="truncate">{archiving ? 'Archiving...' : 'Archive Now'}</span>
              </Button>
            )
          )}

          {!collapsed && !canArchive && <div className="flex-1" />}

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className="gold-btn h-8 w-8 shrink-0"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main data-tone={toneFor(location.pathname)} className="flex-1 min-w-0 h-screen overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
