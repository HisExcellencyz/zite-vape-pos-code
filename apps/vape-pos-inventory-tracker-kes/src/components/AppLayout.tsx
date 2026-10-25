import { ReactNode, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth, logout } from 'zitejs/auth';
import { syncToGoogleSheets } from 'zitejs/api';
import {
  LayoutDashboard, ShoppingCart, Package, Users, Truck,
  Receipt, Settings, LogOut, ChevronLeft, ChevronRight, ChevronsUpDown,
  Wallet, MapPin, Store, Check, Sun, Moon, FileSpreadsheet, Loader2
} from 'lucide-react';
import { cn } from '@project/components/lib/utils';
import { Button } from '@project/components/ui/button';
import { Avatar, AvatarFallback } from '@project/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel
} from '@project/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { useConfirm } from './DialogKit';
import { usePermissions } from '../hooks/usePermissions';
import { useBranch } from '../hooks/useBranch';
import { useTheme } from '../hooks/useTheme';
import LandingBackdrop from './LandingBackdrop';
import { LANDING_BG } from '../lib/brand';

const DEFAULT_LOGO = 'https://images.fillout.com/orgid-811092/flowpublicid-6hepsbbapu/widgetid-default/xmArbfbmsBwLWSE2d2Et7u/pasted-image-1788367385543-n4ulma8b.png';

// `area` links each menu item to the permission matrix on the Users page.
// `alt` is an extra area that also shows the item. `tone` colours the item.
const navGroups: { title: string; items: { to: string; icon: any; label: string; area: string; alt?: string; tone: string }[] }[] = [
  { title: 'Overview', items: [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard', area: 'reports', tone: 'gold' },
    { to: '/pos', icon: ShoppingCart, label: 'POS', area: 'pos', tone: 'blue' },
  ] },
  { title: 'Money', items: [
    { to: '/income', icon: Receipt, label: 'Income', area: 'income', tone: 'green' },
    { to: '/expenses', icon: Wallet, label: 'Expenses', area: 'expenses', alt: 'purchases', tone: 'pink' },
  ] },
  { title: 'Stock & people', items: [
    { to: '/inventory', icon: Package, label: 'Inventory', area: 'inventory', tone: 'blue' },
    { to: '/customers', icon: Users, label: 'Customers', area: 'customers', tone: 'gold' },
    { to: '/suppliers', icon: Truck, label: 'Suppliers', area: 'suppliers', tone: 'pink' },
    { to: '/addresses', icon: MapPin, label: 'Addresses', area: 'addresses', tone: 'green' },
  ] },
  { title: 'Admin', items: [
    { to: '/settings', icon: Settings, label: 'Settings', area: 'settings', tone: 'gold' },
  ] },
];

const allItems = navGroups.flatMap(g => g.items);
const toneFor = (path: string) => allItems.find(i => i.to === '/' + (path.split('/')[1] || ''))?.tone || 'gold';

export default function AppLayout({ children, landing }: { children: ReactNode; landing?: boolean }) {
  const { user } = useAuth();
  const { can, roleName } = usePermissions();
  const { branches, currentBranch, setCurrentBranchId } = useBranch();
  const [collapsed, setCollapsed] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const { theme, toggle } = useTheme();
  const location = useLocation();

  const visible = (item: { area: string; alt?: string }) => can(item.area, 'view') || (!!item.alt && can(item.alt, 'view'));
  const groups = navGroups.map(g => ({ ...g, items: g.items.filter(visible) })).filter(g => g.items.length);
  const outletLogo = currentBranch?.logoUrl || DEFAULT_LOGO;
  const outletName = currentBranch?.branchName || 'Uptown Vapes';
  const canArchive = can('archive', 'view');
  const initial = (user?.firstName?.[0] || user?.email?.[0] || 'U').toUpperCase();

  const confirm = useConfirm();
  const handleArchive = async () => {
    if (archiving) return;
    if (!(await confirm({
      title: 'Archive to Google Sheets now?',
      description: 'All data is copied to the archive sheet. Sales, purchases, expenses and income older than 3 months are then removed from the app.',
      confirmLabel: 'Archive now',
    }))) return;
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
    <div className="h-screen overflow-hidden flex">
      <LandingBackdrop src={LANDING_BG} position="center 35%" opacity={0.1} />
      {/* Floating glass sidebar */}
      <aside
        className={cn(
          'glass m-3 mr-0 flex flex-col rounded-2xl border border-border/60 shadow-[0_20px_50px_-30px_hsl(var(--primary)/0.55)] transition-[width] duration-300',
          collapsed ? 'w-[4.25rem]' : 'w-64'
        )}
      >
        {/* Outlet switcher */}
        <div className="p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn('group flex items-center gap-3 w-full rounded-xl p-1.5 hover:bg-muted/70 transition-colors', collapsed && 'justify-center')}>
                <span className="relative shrink-0">
                  <span className="absolute -inset-1 rounded-xl bg-gradient-to-br from-primary/60 to-secondary/60 blur-md opacity-60 group-hover:opacity-100 transition-opacity" />
                  <img src={outletLogo} alt={outletName} className="relative w-10 h-10 rounded-xl object-cover ring-1 ring-white/20" />
                </span>
                {!collapsed && (
                  <span className="text-left min-w-0 flex-1">
                    <span className="text-sm font-extrabold truncate block text-gradient">{outletName}</span>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Store className="w-3 h-3" /> {branches.length > 1 ? 'Switch outlet' : 'Outlet'}
                    </span>
                  </span>
                )}
                {!collapsed && branches.length > 1 && <ChevronsUpDown className="w-4 h-4 text-muted-foreground shrink-0" />}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>Outlets</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {branches.map(b => (
                <DropdownMenuItem key={b.id} onClick={() => setCurrentBranchId(b.id)} className="gap-2">
                  <img src={b.logoUrl || DEFAULT_LOGO} alt={b.branchName} className="w-6 h-6 rounded-md object-cover shrink-0" />
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

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 pb-3 space-y-4">
          {groups.map(g => (
            <div key={g.title} className="space-y-1">
              {!collapsed
                ? <p className="px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">{g.title}</p>
                : <div className="mx-auto h-px w-6 bg-border" />}
              {g.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  data-tone={item.tone}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) => cn('nav-item', isActive && 'is-active', collapsed && 'justify-center px-0')}
                >
                  <item.icon className="w-[18px] h-[18px] shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* Archive */}
        {canArchive && (
          <div className="px-3 pb-2">
            <Button
              variant="secondary"
              size={collapsed ? 'icon' : 'sm'}
              onClick={handleArchive}
              disabled={archiving}
              className={cn(collapsed ? 'w-10 h-10 mx-auto flex' : 'w-full h-9')}
              title="Copy all data to your Google Sheet; transactions older than 3 months are then removed from the app"
            >
              {archiving ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
              {!collapsed && (archiving ? 'Archiving…' : 'Archive Now')}
            </Button>
          </div>
        )}

        {/* Profile + controls */}
        <div className={cn('m-3 mt-1 rounded-xl border border-border/60 bg-background/40 p-2 flex gap-1', collapsed ? 'flex-col items-center' : 'items-center')}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn('flex items-center gap-2 min-w-0 rounded-lg p-1 hover:bg-muted/70 transition-colors', !collapsed && 'flex-1')}>
                <Avatar className="w-8 h-8 ring-2 ring-primary/30">
                  <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-primary-foreground text-xs font-bold">{initial}</AvatarFallback>
                </Avatar>
                {!collapsed && (
                  <span className="text-left min-w-0">
                    <span className="block text-xs font-semibold text-foreground truncate">{user?.firstName || user?.email}</span>
                    <span className="block text-[10px] text-primary truncate">{roleName || user?.email}</span>
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-56">
              <DropdownMenuLabel className="truncate">{user?.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => logout()} className="text-destructive">
                <LogOut className="w-4 h-4 mr-2" /> Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon" onClick={toggle} className="h-8 w-8 shrink-0" title="Toggle light / dark mode">
            {theme === 'dark' ? <Sun /> : <Moon />}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setCollapsed(!collapsed)} className="h-8 w-8 shrink-0" title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <ChevronRight /> : <ChevronLeft />}
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main data-tone={toneFor(location.pathname)} className="flex-1 min-w-0 h-screen overflow-y-auto">
        <div key={location.pathname} className={cn('animate-rise min-h-full', landing && 'landing')}>{children}</div>
      </main>
    </div>
  );
}
