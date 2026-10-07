import { useState, useEffect } from 'react';
import { saveBranch, getSales } from 'zitejs/api';
import { Link } from 'react-router-dom';
import DashboardPage from './DashboardPage';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@project/components/ui/tabs';
import { Switch } from '@project/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@project/components/ui/dialog';
import { Store, Plus, Pencil, Trash2, Check, Shield, Truck, Bike, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { useBranch, Branch, autoOn } from '../hooks/useBranch';
import { Rider, Riders, RiderType, RIDER_LABELS, DEFAULT_DELIVERY_FEE, loadRiders, persistRiders, newRiderId } from '../lib/delivery';
import DateRangeFilter, { Range, inRange } from '../components/DateRangeFilter';

const DEFAULT_LOGO = 'https://images.fillout.com/orgid-811092/flowpublicid-6hepsbbapu/widgetid-default/xmArbfbmsBwLWSE2d2Et7u/pasted-image-1788367385543-n4ulma8b.png';

import CommissionEditor from '../components/CommissionEditor';
import type { Commission } from '../hooks/useBranch';
import { usePermissions } from '../hooks/usePermissions';

const defaultIncomes = (): Commission[] => [{ name: 'Delivery Fee', type: 'fixed', value: DEFAULT_DELIVERY_FEE, enabled: true }];

// The standard deductions every outlet carries, in this order.
const STANDARD_DEDUCTIONS: Commission[] = [
  { name: 'Glovo', type: 'percent', value: 11.6, enabled: true },
  { name: 'Rider Fee', type: 'fixed', value: 340, enabled: true },
  { name: 'Promo', type: 'fixed', value: 70, enabled: false },
];
const sameName = (a?: string, b?: string) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();

/** Orders, amount (KES) and distance (km) handled by a rider or a whole category of riders. */
interface Stat { orders: number; amount: number; km: number; }
const emptyStat = (): Stat => ({ orders: 0, amount: 0, km: 0 });
const RIDER_NOTE = /Rider \((3PL|Own)\): ([^|]+)/;
const fmtKes = (n: number) => `KES ${Math.round(n).toLocaleString()}`;
const fmtKm = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString()} km`;

export default function SettingsPage() {
  const { can } = usePermissions();
  const { branches, currentBranch, setCurrentBranchId, refresh: refreshBranches } = useBranch();
  const [outletDialogOpen, setOutletDialogOpen] = useState(false);
  const [editingOutlet, setEditingOutlet] = useState<Branch | null>(null);
  const [outletName, setOutletName] = useState('');
  const [outletAddress, setOutletAddress] = useState('');
  const [outletPhone, setOutletPhone] = useState('');
  const [outletTaxId, setOutletTaxId] = useState('');
  const [outletLogoUrl, setOutletLogoUrl] = useState('');
  const [outletCoverUrl, setOutletCoverUrl] = useState('');
  const [outletIncomes, setOutletIncomes] = useState<Commission[]>(defaultIncomes());
  const [outletIsMain, setOutletIsMain] = useState(false);
  const [outletActive, setOutletActive] = useState(true);
  const [savingOutlet, setSavingOutlet] = useState(false);
  const [outletCommissions, setOutletCommissions] = useState<Commission[]>([]);

  // Delivery riders (shared by every outlet)
  const [riders, setRiders] = useState<Riders>({ threePl: [], own: [] });
  const [riderDialog, setRiderDialog] = useState<{ type: RiderType; id?: string } | null>(null);
  const [rName, setRName] = useState('');
  const [rPhone, setRPhone] = useState('');
  const [rNotes, setRNotes] = useState('');
  const [savingRider, setSavingRider] = useState(false);

  // Delivery statistics (all outlets), filtered by the date range picker
  const [sales, setSales] = useState<any[]>([]);
  const [range, setRange] = useState<Range>({});

  useEffect(() => {
    loadRiders().then(setRiders).catch(() => {});
    getSales({}).then(r => setSales(r.sales as any[])).catch(() => {});
  }, []);

  // Per category and per rider (matched by name) totals from the rider noted on each sale.
  const catStats: Record<RiderType, Stat> = { threePl: emptyStat(), own: emptyStat() };
  const riderStats = new Map<string, Stat>();
  for (const s of sales) {
    if (s.status === 'Voided' || !inRange(range, s.saleDate)) continue;
    const m = RIDER_NOTE.exec(s.notes || '');
    if (!m) continue;
    const type: RiderType = m[1] === '3PL' ? 'threePl' : 'own';
    const key = `${type}|${m[2].trim().toLowerCase()}`;
    const amount = Number(s.total) || 0;
    const km = Number(s.deliveryDistanceKm) || 0;
    const rs = riderStats.get(key) || emptyStat();
    rs.orders += 1; rs.amount += amount; rs.km += km;
    riderStats.set(key, rs);
    catStats[type].orders += 1; catStats[type].amount += amount; catStats[type].km += km;
  }

  // A new outlet starts with Glovo, Rider Fee and Promo, copied from an existing outlet when it has them.
  const standardDeductions = (): Commission[] =>
    STANDARD_DEDUCTIONS.map(def => {
      for (const b of branches) {
        const found = (b.commissions || []).find(c => sameName(c.name, def.name));
        if (found) return { ...found, enabled: autoOn(found) };
      }
      return { ...def };
    });

  const openNewOutlet = () => {
    setEditingOutlet(null);
    setOutletName(''); setOutletAddress(''); setOutletPhone(''); setOutletTaxId('');
    setOutletLogoUrl(''); setOutletCoverUrl(''); setOutletIncomes(defaultIncomes());
    setOutletIsMain(branches.length === 0); setOutletActive(true); setOutletCommissions(standardDeductions());
    setOutletDialogOpen(true);
  };

  const openEditOutlet = (b: Branch) => {
    setEditingOutlet(b);
    setOutletName(b.branchName || '');
    setOutletAddress(b.address || '');
    setOutletPhone(b.phone || '');
    setOutletTaxId(b.taxId || '');
    setOutletLogoUrl(b.logoUrl || '');
    setOutletCoverUrl(b.coverPhotoUrl || '');
    setOutletIncomes((b.incomes ?? defaultIncomes()).map(c => ({ ...c, enabled: autoOn(c) })));
    setOutletIsMain(!!b.isMainBranch);
    setOutletActive(b.active !== false);
    setOutletCommissions((b.commissions || []).map(c => ({ ...c, enabled: autoOn(c) })));
    setOutletDialogOpen(true);
  };

  const handleSaveOutlet = async () => {
    if (!outletName.trim()) return toast.error('Outlet name is required');
    if (outletIncomes.some(c => c.name.trim() && (!Number.isFinite(c.value) || c.value < 0))) return toast.error('Enter valid amounts (0 or more) for the incomes');
    setSavingOutlet(true);
    try {
      const res = await saveBranch({
        id: editingOutlet?.id,
        branchName: outletName.trim(),
        address: outletAddress || undefined,
        phone: outletPhone || undefined,
        taxId: outletTaxId || undefined,
        logoUrl: outletLogoUrl || undefined,
        coverPhotoUrl: outletCoverUrl || undefined,
        isMainBranch: outletIsMain,
        active: outletActive,
        incomes: outletIncomes.filter(c => c.name.trim()).map(c => ({ ...c, enabled: autoOn(c) })),
        commissions: outletCommissions.filter(c => c.name.trim() && c.value > 0).map(c => ({ ...c, enabled: autoOn(c) })),
      });
      toast.success(editingOutlet ? 'Outlet updated' : 'Outlet created');
      setOutletDialogOpen(false);
      await refreshBranches();
      if (!editingOutlet && res.branch) setCurrentBranchId((res.branch as any).id);
    } catch (e: any) {
      toast.error(e.message || 'Failed to save outlet');
    } finally {
      setSavingOutlet(false);
    }
  };

  // ── Delivery riders ──
  const openRider = (type: RiderType, r?: Rider) => {
    setRiderDialog({ type, id: r?.id });
    setRName(r?.name || ''); setRPhone(r?.phone || ''); setRNotes(r?.notes || '');
  };

  const saveRiders = async (next: Riders, msg: string) => {
    setSavingRider(true);
    try {
      await persistRiders(next);
      setRiders(next);
      toast.success(msg);
      return true;
    } catch (e: any) {
      toast.error(e.message || 'Failed to save riders');
      return false;
    } finally {
      setSavingRider(false);
    }
  };

  const handleSaveRider = async () => {
    if (!riderDialog) return;
    if (!rName.trim()) return toast.error('Name is required');
    const { type, id } = riderDialog;
    const entry: Rider = { id: id || newRiderId(), name: rName.trim(), phone: rPhone.trim() || undefined, notes: rNotes.trim() || undefined };
    const list = id ? riders[type].map(r => (r.id === id ? entry : r)) : [...riders[type], entry];
    const ok = await saveRiders({ ...riders, [type]: list }, id ? 'Rider updated' : 'Rider added');
    if (ok) setRiderDialog(null);
  };

  const handleDeleteRider = async (type: RiderType, r: Rider) => {
    if (!window.confirm(`Remove ${r.name}? Past sales keep their rider name.`)) return;
    await saveRiders({ ...riders, [type]: riders[type].filter(x => x.id !== r.id) }, 'Rider removed');
  };

  const statBox = (label: string, value: string, cls: string) => (
    <div className={`rounded-lg border bg-muted/30 px-2 py-1.5 border-l-4 ${cls}`}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm font-bold text-foreground break-words">{value}</p>
    </div>
  );

  const riderCard = (type: RiderType, Icon: any) => {
    const cat = catStats[type];
    return (
      <Card className="bg-card border-border">
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Icon className="w-4 h-4 text-primary" /> {RIDER_LABELS[type]}</CardTitle>
          {can('settings', 'create') && <Button size="sm" onClick={() => openRider(type)}><Plus className="w-4 h-4 mr-1" /> Add</Button>}
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Category totals for the chosen dates */}
          <div className="grid grid-cols-3 gap-2">
            {statBox('Orders', cat.orders.toLocaleString(), 'border-l-pink-500')}
            {statBox('Amount', fmtKes(cat.amount), 'border-l-amber-500')}
            {statBox('Distance', fmtKm(cat.km), 'border-l-sky-500')}
          </div>

          <div className="space-y-2">
            {riders[type].length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No {RIDER_LABELS[type].toLowerCase()} added yet.</p>
            ) : riders[type].map(r => {
              const st = riderStats.get(`${type}|${r.name.trim().toLowerCase()}`) || emptyStat();
              return (
                <div key={r.id} className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground break-words">{r.name}</p>
                    {r.phone && <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" /> {r.phone}</p>}
                    {r.notes && <p className="text-xs text-muted-foreground break-words">{r.notes}</p>}
                    <p className="text-[11px] text-primary mt-0.5">
                      {st.orders} order{st.orders === 1 ? '' : 's'} · {fmtKes(st.amount)} · {fmtKm(st.km)}
                    </p>
                  </div>
                  {can('settings', 'edit') && <Button variant="ghost" size="sm" onClick={() => openRider(type, r)}><Pencil className="w-3.5 h-3.5" /></Button>}
                  {can('settings', 'delete') && <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDeleteRider(type, r)}><Trash2 className="w-3.5 h-3.5" /></Button>}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  };

  const incomeChip = (b: Branch) => {
    const inc = (b.incomes ?? [])[0];
    if (!inc) return null;
    return (
      <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">
        {inc.name} {inc.type === 'percent' ? `${inc.value}%` : `KES ${(inc.value || 0).toLocaleString()}`}
      </span>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your outlets, business overview and delivery</p>
        </div>
        {can('users', 'view') && <Button asChild variant="outline" size="sm"><Link to="/users"><Shield className="w-4 h-4 mr-1" /> Users</Link></Button>}
      </div>

      <Tabs defaultValue="outlets">
        <TabsList className="bg-muted">
          <TabsTrigger value="outlets">Outlets</TabsTrigger>
          <TabsTrigger value="business">Business Overview</TabsTrigger>
          <TabsTrigger value="delivery">Delivery</TabsTrigger>
        </TabsList>

        <TabsContent value="outlets" className="mt-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm text-muted-foreground max-w-xl">
              Each outlet is independent, with its own name, address, logo and cover photo — there's no shared
              business name across outlets. Switch between them from the sidebar, and the Dashboard can be
              filtered to a single outlet at a time. Suppliers, customers and addresses are shared by all outlets.
            </p>
            {can('settings', 'create') && <Button size="sm" onClick={openNewOutlet}><Plus className="w-4 h-4 mr-1" /> Add Outlet</Button>}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {branches.map(b => (
              <Card key={b.id} className={`bg-card ${b.id === currentBranch?.id ? 'border-primary' : 'border-border'}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <img src={b.logoUrl || DEFAULT_LOGO} alt={b.branchName} className="w-12 h-12 rounded-lg object-cover shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground break-words whitespace-normal leading-snug">{b.branchName}</p>
                      {b.address && <p className="text-xs text-muted-foreground break-words whitespace-normal mt-0.5">{b.address}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    {b.isMainBranch && <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary">Main Outlet</span>}
                    {b.active === false && <span className="px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">Inactive</span>}
                    {b.id === currentBranch?.id && <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center gap-1"><Check className="w-3 h-3" /> Active view</span>}
                    {incomeChip(b)}
                  </div>
                  <div className="flex gap-2 pt-1 border-t border-border">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => setCurrentBranchId(b.id)} disabled={b.id === currentBranch?.id}>
                      <Store className="w-3.5 h-3.5 mr-1" /> Switch here
                    </Button>
                    {can('settings', 'edit') && <Button variant="ghost" size="sm" onClick={() => openEditOutlet(b)}><Pencil className="w-3.5 h-3.5" /></Button>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Dialog open={outletDialogOpen} onOpenChange={setOutletDialogOpen}>
            <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editingOutlet ? 'Edit Outlet' : 'Add Outlet'}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Outlet Name *</Label>
                  <Input value={outletName} onChange={e => setOutletName(e.target.value)} placeholder="e.g. Westlands Branch" />
                </div>
                <div>
                  <Label>Address</Label>
                  <Input value={outletAddress} onChange={e => setOutletAddress(e.target.value)} placeholder="Physical address" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Phone</Label>
                    <Input value={outletPhone} onChange={e => setOutletPhone(e.target.value)} placeholder="+254..." />
                  </div>
                  <div>
                    <Label>Tax ID</Label>
                    <Input value={outletTaxId} onChange={e => setOutletTaxId(e.target.value)} />
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  {outletLogoUrl && (
                    <img src={outletLogoUrl} alt="Logo preview" className="w-14 h-14 rounded-lg object-cover border border-border shrink-0" onError={e => (e.currentTarget.style.display = 'none')} />
                  )}
                  <div className="flex-1 min-w-0">
                    <Label>Logo URL</Label>
                    <Input value={outletLogoUrl} onChange={e => setOutletLogoUrl(e.target.value)} placeholder="https://example.com/logo.png" />
                  </div>
                </div>
                <div>
                  <Label>Cover Photo URL</Label>
                  <Input value={outletCoverUrl} onChange={e => setOutletCoverUrl(e.target.value)} placeholder="https://example.com/cover.jpg" />
                  {outletCoverUrl && (
                    <img src={outletCoverUrl} alt="Cover preview" className="mt-2 w-full h-24 rounded-lg object-cover border border-border" onError={e => (e.currentTarget.style.display = 'none')} />
                  )}
                </div>
                <CommissionEditor
                  title="Incomes & Revenues"
                  namePlaceholder="e.g. Delivery Fee"
                  description="Charged on top of the order. The first one is the Delivery Fee. Switched-on items are added automatically to every POS order and can be switched off per order. Names show on the POS cart."
                  value={outletIncomes}
                  onChange={setOutletIncomes}
                />
                <CommissionEditor
                  title="Commissions & Deductions"
                  namePlaceholder="e.g. Glovo"
                  description="Glovo, Rider Fee and Promo come with every outlet. Switched-on items are deducted automatically on every POS order and can be switched off per order. Names show on the POS cart."
                  value={outletCommissions}
                  onChange={setOutletCommissions}
                />
                <div className="flex items-center gap-3">
                  <Switch checked={outletIsMain} onCheckedChange={setOutletIsMain} />
                  <Label className="text-sm">Set as the main outlet (default view)</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={outletActive} onCheckedChange={setOutletActive} />
                  <Label className="text-sm">Active</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOutletDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSaveOutlet} disabled={savingOutlet}>{savingOutlet ? 'Saving...' : editingOutlet ? 'Update Outlet' : 'Create Outlet'}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="business" className="mt-4 -mx-6">
          <DashboardPage scope="business" />
        </TabsContent>

        <TabsContent value="delivery" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground max-w-2xl">
            Riders added here are shared by every outlet. At POS, the cashier picks which 3PL or own rider is handling an order.
            The delivery fee per order is set for each outlet under Outlets, in Incomes &amp; Revenues.
            Orders, amounts and distances below cover all outlets for the dates you pick.
          </p>

          {/* Date picker: presets (Today, Yesterday, 7 days, 30 days) or a custom start and end date */}
          <DateRangeFilter value={range} onChange={setRange} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {riderCard('threePl', Truck)}
            {riderCard('own', Bike)}
          </div>

          <Dialog open={!!riderDialog} onOpenChange={o => { if (!o) setRiderDialog(null); }}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>{riderDialog?.id ? 'Edit' : 'Add'} {riderDialog?.type === 'threePl' ? '3PL Rider' : 'Own Rider'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div><Label>Name *</Label><Input value={rName} onChange={e => setRName(e.target.value)} placeholder={riderDialog?.type === 'threePl' ? 'e.g. Sendy, Glovo or rider name' : 'Rider name'} /></div>
                <div><Label>Phone</Label><Input value={rPhone} onChange={e => setRPhone(e.target.value)} placeholder="+254..." /></div>
                <div><Label>Notes</Label><Input value={rNotes} onChange={e => setRNotes(e.target.value)} placeholder="Optional" /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRiderDialog(null)}>Cancel</Button>
                <Button onClick={handleSaveRider} disabled={savingRider}>{savingRider ? 'Saving...' : riderDialog?.id ? 'Update' : 'Add'}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}
