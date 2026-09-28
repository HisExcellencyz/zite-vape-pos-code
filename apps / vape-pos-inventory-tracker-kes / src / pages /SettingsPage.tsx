import { useState, useEffect } from 'react';
import { getSettings, saveSettings, saveBranch } from 'zitejs/api';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@project/components/ui/tabs';
import { Switch } from '@project/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@project/components/ui/dialog';
import { Building2, Save, Palette, Store, Plus, Pencil, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useBranch, Branch } from '../hooks/useBranch';

const DEFAULT_LOGO = 'https://images.fillout.com/orgid-811092/flowpublicid-6hepsbbapu/widgetid-default/xmArbfbmsBwLWSE2d2Et7u/pasted-image-1788367385543-n4ulma8b.png';

export default function SettingsPage() {
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState('Uptown Vapes');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [taxId, setTaxId] = useState('');
  const [defaultCurrency, setDefaultCurrency] = useState('KES');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    getSettings({}).then(res => {
      if (res.settings) {
        const s = res.settings as any;
        setSettingsId(s.id);
        setBusinessName(s.businessName || 'Uptown Vapes');
        setAddress(s.address || '');
        setPhone(s.phone || '');
        setEmail(s.email || '');
        setTaxId(s.taxId || '');
        setDefaultCurrency(s.defaultCurrency || 'KES');
      }
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await saveSettings({
        id: settingsId || undefined,
        businessName,
        address: address || undefined,
        phone: phone || undefined,
        email: email || undefined,
        taxId: taxId || undefined,
        defaultCurrency: defaultCurrency || undefined,
      });
      if (!settingsId && res.settings) {
        setSettingsId((res.settings as any).id);
      }
      toast.success('Settings saved');
    } catch (e: any) {
      toast.error(e.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const openNewOutlet = () => {
    setEditingOutlet(null);
    setOutletName(''); setOutletAddress(''); setOutletPhone(''); setOutletTaxId('');
    setOutletLogoUrl(''); setOutletCoverUrl(''); setOutletIsMain(branches.length === 0); setOutletActive(true);
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

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your business configuration</p>
      </div>

      <Tabs defaultValue="business">
        <TabsList className="bg-muted">
          <TabsTrigger value="business">Business Details</TabsTrigger>
          <TabsTrigger value="outlets">Outlets</TabsTrigger>
          <TabsTrigger value="theme">Theme</TabsTrigger>
        </TabsList>

        <TabsContent value="business" className="mt-4">
          <Card className="bg-card border-border max-w-2xl">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" /> Business Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Business Name *</Label>
                  <Input value={businessName} onChange={e => setBusinessName(e.target.value)} />
                </div>
                <div>
                  <Label>Default Currency</Label>
                  <Input value={defaultCurrency} onChange={e => setDefaultCurrency(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Address</Label>
                <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Business address" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Phone</Label>
                  <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+254..." />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="info@example.com" />
                </div>
              </div>
              <div>
                <Label>Tax ID / PIN</Label>
                <Input value={taxId} onChange={e => setTaxId(e.target.value)} placeholder="e.g. P051234567X" />
              </div>
              <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
                <Save className="w-4 h-4 mr-1" /> {saving ? 'Saving...' : 'Save Settings'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="outlets" className="mt-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm text-muted-foreground max-w-xl">
              Each outlet can have its own name, logo and cover photo, and can be switched between from the sidebar.
              Reports on the Dashboard can be filtered to a single outlet.
            </p>
            <Button size="sm" onClick={openNewOutlet}><Plus className="w-4 h-4 mr-1" /> Add Outlet</Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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

        <TabsContent value="theme" className="mt-4">
          <Card className="bg-card border-border max-w-2xl">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Palette className="w-4 h-4 text-secondary" /> Theme Customization
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { name: 'Blue & Pink (Default)', colors: ['#3B82F6', '#EC4899', '#0F172A'] },
                  { name: 'Green & Gold', colors: ['#22C55E', '#F59E0B', '#0F172A'] },
                  { name: 'Purple & Teal', colors: ['#8B5CF6', '#14B8A6', '#0F172A'] },
                ].map(theme => (
                  <button key={theme.name} className="p-4 border border-border rounded-xl hover:border-primary/50 transition-colors text-left">
                    <div className="flex gap-1.5 mb-3">
                      {theme.colors.map((c, i) => (
                        <div key={i} className="w-6 h-6 rounded-full" style={{ backgroundColor: c }} />
                      ))}
                    </div>
                    <p className="text-xs font-medium text-foreground">{theme.name}</p>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-4">More theme options coming soon.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
