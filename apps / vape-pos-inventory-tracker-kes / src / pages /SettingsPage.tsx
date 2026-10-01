import { useState, useEffect } from 'react';
import { saveBranch, getSettings, saveSettings, syncToGoogleSheets } from 'zitejs/api';
import { Link } from 'react-router-dom';
import DashboardPage from './DashboardPage';
import { useTheme } from '../hooks/useTheme';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@project/components/ui/tabs';
import { Switch } from '@project/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@project/components/ui/dialog';
import { Palette, Store, Plus, Pencil, Check, FileSpreadsheet, Save, Shield, Moon, Sun } from 'lucide-react';
import { toast } from 'sonner';
import { useBranch, Branch } from '../hooks/useBranch';

const DEFAULT_LOGO = 'https://images.fillout.com/orgid-811092/flowpublicid-6hepsbbapu/widgetid-default/xmArbfbmsBwLWSE2d2Et7u/pasted-image-1788367385543-n4ulma8b.png';

// businessSettings still exists as a table but is no longer presented as a
// single "umbrella business" identity — it's now just where free-form
// integration config (Google Sheets webhook, archival email) is kept,
// mirroring the same customFields pattern used elsewhere in this app.
const FALLBACK_SETTINGS_NAME = 'App Settings';

import CommissionEditor from '../components/CommissionEditor';
import type { Commission } from '../hooks/useBranch';

export default function SettingsPage() {
  const { branches, currentBranch, setCurrentBranchId, refresh: refreshBranches } = useBranch();
  const [outletDialogOpen, setOutletDialogOpen] = useState(false);
  const [editingOutlet, setEditingOutlet] = useState<Branch | null>(null);
  const [outletName, setOutletName] = useState('');
  const [outletAddress, setOutletAddress] = useState('');
  const [outletPhone, setOutletPhone] = useState('');
  const [outletTaxId, setOutletTaxId] = useState('');
  const [outletLogoUrl, setOutletLogoUrl] = useState('');
  const [outletCoverUrl, setOutletCoverUrl] = useState('');
  const [outletIsMain, setOutletIsMain] = useState(false);
  const [outletActive, setOutletActive] = useState(true);
  const [savingOutlet, setSavingOutlet] = useState(false);
  const [outletCommissions, setOutletCommissions] = useState<Commission[]>([]);
  const { theme, setTheme } = useTheme();

  // Integrations tab
  const [settingsId, setSettingsId] = useState<string | undefined>();
  const [settingsBusinessName, setSettingsBusinessName] = useState<string>(FALLBACK_SETTINGS_NAME);
  const [settingsEmail, setSettingsEmail] = useState('');
  const [sheetsWebhookUrl, setSheetsWebhookUrl] = useState('');
  const [archivalEmail, setArchivalEmail] = useState('');
  const [savingIntegrations, setSavingIntegrations] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    getSettings({}).then(res => {
      const s = res.settings as any;
      if (s) {
        setSettingsId(s.id);
        setSettingsBusinessName(s.businessName || FALLBACK_SETTINGS_NAME);
        setSettingsEmail(s.email || '');
        let cfg: any = {};
        try { cfg = s.customFields ? JSON.parse(s.customFields) : {}; } catch {}
        setSheetsWebhookUrl(cfg.googleSheetsWebhookUrl || '');
        setArchivalEmail(cfg.archivalEmail || '');
      }
    }).catch(() => {});
  }, []);

  const openNewOutlet = () => {
    setEditingOutlet(null);
    setOutletName(''); setOutletAddress(''); setOutletPhone(''); setOutletTaxId('');
    setOutletLogoUrl(''); setOutletCoverUrl(''); setOutletIsMain(branches.length === 0); setOutletActive(true); setOutletCommissions([]);
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
    setOutletIsMain(!!b.isMainBranch);
    setOutletActive(b.active !== false);
    setOutletCommissions(b.commissions || []);
    setOutletDialogOpen(true);
  };

  const handleSaveOutlet = async () => {
    if (!outletName.trim()) return toast.error('Outlet name is required');
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
        commissions: outletCommissions.filter(c => c.name.trim() && c.value > 0),
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

  const handleSaveIntegrations = async () => {
    setSavingIntegrations(true);
    try {
      const res = await saveSettings({
        id: settingsId,
        businessName: settingsBusinessName || FALLBACK_SETTINGS_NAME,
        email: settingsEmail || undefined,
        customFields: JSON.stringify({ googleSheetsWebhookUrl: sheetsWebhookUrl, archivalEmail }),
      });
      if (!settingsId && res.settings) setSettingsId((res.settings as any).id);
      toast.success('Google Sheet link saved');
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSavingIntegrations(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const res = await syncToGoogleSheets({});
      toast.success(res.message);
    } catch (e: any) {
      toast.error(e.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your outlets, business overview and appearance</p>
        </div>
        <Button asChild variant="outline" size="sm"><Link to="/users"><Shield className="w-4 h-4 mr-1" /> Users</Link></Button>
      </div>

      <Tabs defaultValue="outlets">
        <TabsList className="bg-muted">
          <TabsTrigger value="outlets">Outlets</TabsTrigger>
          <TabsTrigger value="business">Business Overview</TabsTrigger>
          <TabsTrigger value="theme">Theme</TabsTrigger>
        </TabsList>

        <TabsContent value="outlets" className="mt-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm text-muted-foreground max-w-xl">
              Each outlet is independent, with its own name, address, logo and cover photo — there's no shared
              business name across outlets. Switch between them from the sidebar, and the Dashboard can be
              filtered to a single outlet at a time.
            </p>
            <Button size="sm" onClick={openNewOutlet}><Plus className="w-4 h-4 mr-1" /> Add Outlet</Button>
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
                  </div>
                  <div className="flex gap-2 pt-1 border-t border-border">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => setCurrentBranchId(b.id)} disabled={b.id === currentBranch?.id}>
                      <Store className="w-3.5 h-3.5 mr-1" /> Switch here
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEditOutlet(b)}><Pencil className="w-3.5 h-3.5" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="bg-card border-border w-full max-w-[403px]">
            <CardContent className="p-3 space-y-2">
              <p className="text-sm font-semibold flex items-center gap-2"><FileSpreadsheet className="w-4 h-4 text-emerald-400" /> Archive to Google Sheets</p>
              <p className="text-xs text-muted-foreground">Copies products, customers, suppliers, sales, purchases, expenses and income from every outlet to your connected Google Sheet.</p>
              <p className="text-[11px] text-muted-foreground">Sends to your connected "Uptown; Drinks POS Database" sheet. Sales, purchases, expenses and income older than 3 months are removed from the app after each archive.</p>
              <Button size="sm" className="h-8 w-full" onClick={handleSyncNow} disabled={syncing}>{syncing ? 'Archiving...' : 'Archive Now'}</Button>
            </CardContent>
          </Card>

          <Dialog open={outletDialogOpen} onOpenChange={setOutletDialogOpen}>
            <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
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
                <CommissionEditor value={outletCommissions} onChange={setOutletCommissions} />
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

        <TabsContent value="theme" className="mt-4">
          <Card className="bg-card border-border max-w-2xl">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Palette className="w-4 h-4 text-secondary" /> Appearance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 max-w-sm">
                {([['light', 'Light', Sun], ['dark', 'Dark', Moon]] as const).map(([val, label, Icon]) => (
                  <button key={val} onClick={() => setTheme(val)} className={`p-4 border rounded-xl transition-colors flex items-center gap-2 ${theme === val ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground hover:border-primary/50'}`}>
                    <Icon className="w-4 h-4" /> <span className="text-sm font-medium">{label} mode</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
