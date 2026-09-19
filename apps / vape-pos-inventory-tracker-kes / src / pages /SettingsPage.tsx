import { useState, useEffect } from 'react';
import { getSettings, saveSettings } from 'zitejs/api';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@project/components/ui/tabs';
import { Building2, Save, Palette } from 'lucide-react';
import { toast } from 'sonner';

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
