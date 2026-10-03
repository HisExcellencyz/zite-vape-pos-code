import { useState, useEffect } from 'react';
import { getAddresses, saveAddress, deleteRecord } from 'zitejs/api';
import { Card, CardContent } from '@project/components/ui/card';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Badge } from '@project/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@project/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@project/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@project/components/ui/alert-dialog';
import { Plus, MapPin, Trash2, Edit } from 'lucide-react';
import { toast } from 'sonner';
import MapView from '../components/MapView';
import LocationTabs, { PinStatus } from '../components/LocationTabs';
import DeliveriesPanel from '../components/DeliveriesPanel';
import { parseCoordinates } from '../lib/geocode';

interface Address {
  id: string;
  addressName?: string;
  type?: string;
  fullAddress?: string;
  plusCode?: string;
  coordinates?: string;
  notes?: string;
  active?: boolean;
}

// Colour logic is unchanged: pickup = blue, delivery = green, branch = purple, other = grey.
const typeColors: Record<string, string> = {
  pickup: 'bg-blue-500/10 text-blue-400',
  delivery: 'bg-green-500/10 text-green-400',
  branch: 'bg-purple-500/10 text-purple-400',
  other: 'bg-gray-500/10 text-gray-400',
};

const pinColor = (t?: string) =>
  t === 'pickup' ? '#3b82f6' : t === 'delivery' ? '#22c55e' : t === 'branch' ? '#a855f7' : '#6b7280';

const typeLabel = (t?: string) =>
  t === 'pickup' ? 'Pickup Point' : t === 'delivery' ? 'Delivery' : t === 'branch' ? 'Branch' : 'Other';

export default function AddressesPage() {
  const [tab, setTab] = useState('suppliers');
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null);

  // Form
  const [editId, setEditId] = useState<string | undefined>();
  const [name, setName] = useState('');
  const [type, setType] = useState<'pickup' | 'delivery' | 'branch' | 'other'>('pickup');
  const [fullAddress, setFullAddress] = useState('');
  const [plusCode, setPlusCode] = useState('');
  const [coordinates, setCoordinates] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedPin, setSelectedPin] = useState<{ lat: number; lng: number } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getAddresses({});
      setAddresses(res.addresses as Address[]);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditId(undefined); setName(''); setType('pickup');
    setFullAddress(''); setPlusCode(''); setCoordinates('');
    setNotes(''); setSelectedPin(null); setShowForm(true);
  };

  const openEdit = (a: Address) => {
    setEditId(a.id); setName(a.addressName || '');
    setType((a.type as any) || 'pickup');
    setFullAddress(a.fullAddress || '');
    setPlusCode(a.plusCode || '');
    setCoordinates(a.coordinates || '');
    setNotes(a.notes || '');
    setSelectedPin(parseCoordinates(a.coordinates));
    setShowForm(true);
  };

  const handleMapClick = (lat: number, lng: number) => {
    setSelectedPin({ lat, lng });
    setCoordinates(`${lat.toFixed(6)},${lng.toFixed(6)}`);
  };

  // Called by the Search / Coordinates / Plus code ribbon.
  const handlePick = (lat: number, lng: number, address?: string, plusCodeResult?: string) => {
    setSelectedPin({ lat, lng });
    setCoordinates(`${lat.toFixed(6)},${lng.toFixed(6)}`);
    if (address && !fullAddress) setFullAddress(address);
    if (plusCodeResult) setPlusCode(plusCodeResult);
  };

  const handleCoordsChange = (val: string) => {
    setCoordinates(val);
    const p = parseCoordinates(val);
    if (p) setSelectedPin(p);
  };

  const handleSave = async () => {
    if (!name.trim()) return toast.error('Name is required');
    setSaving(true);
    try {
      await saveAddress({
        id: editId,
        addressName: name,
        type,
        fullAddress: fullAddress || undefined,
        plusCode: plusCode || undefined,
        coordinates: coordinates || undefined,
        notes: notes || undefined,
      });
      toast.success(editId ? 'Address updated' : 'Address added');
      setShowForm(false);
      load();
    } catch (e: any) { toast.error(e.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRecord({ table: 'addresses', id });
      toast.success('Deleted');
      if (activeId === id) setActiveId(null);
      load();
    } catch { toast.error('Delete failed'); }
  };

  const selectTile = (a: Address) => {
    setActiveId(a.id);
    const p = parseCoordinates(a.coordinates);
    if (p) setFocus({ ...p }); // new object each click so the map re-centres
  };

  const mapPins = addresses
    .map(a => ({ a, p: parseCoordinates(a.coordinates) }))
    .filter(x => x.p)
    .map(x => ({ lat: x.p!.lat, lng: x.p!.lng, label: x.a.addressName || '', color: pinColor(x.a.type) }));

  const renderActions = (a: Address) => (
    <div className="flex gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(a)}><Edit className="w-3.5 h-3.5" /></Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete this address?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(a.id)}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Addresses</h1>
          <p className="text-sm text-muted-foreground">
            {tab === 'suppliers' ? `${addresses.length} addresses saved` : 'Where your orders are delivered'}
          </p>
        </div>
        {tab === 'suppliers' && (
          <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Add Address</Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted">
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="deliveries">Deliveries</TabsTrigger>
        </TabsList>

        <TabsContent value="suppliers" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(300px,380px)_1fr]">
            {/* Left: address tiles */}
            <div className="space-y-2 lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto lg:pr-1 order-2 lg:order-1">
              {loading ? (
                [...Array(4)].map((_, i) => (
                  <Card key={i} className="bg-card border-border"><CardContent className="p-3"><div className="h-10 bg-muted rounded animate-pulse" /></CardContent></Card>
                ))
              ) : addresses.length === 0 ? (
                <Card className="bg-card border-border">
                  <CardContent className="p-10 text-center text-muted-foreground">
                    <MapPin className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    No addresses yet. Add your commonly used pickup points and delivery addresses.
                  </CardContent>
                </Card>
              ) : addresses.map(a => (
                <Card
                  key={a.id}
                  onClick={() => selectTile(a)}
                  className={`bg-card cursor-pointer transition-colors ${activeId === a.id ? 'border-primary' : 'border-border'}`}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 mt-0.5 shrink-0" style={{ color: pinColor(a.type) }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm text-foreground break-words leading-snug">{a.addressName}</h3>
                          <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${typeColors[a.type || 'other'] || typeColors.other}`}>
                            {typeLabel(a.type)}
                          </Badge>
                        </div>
                        {a.fullAddress && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 break-words">{a.fullAddress}</p>}
                        {a.notes && <p className="text-[11px] text-muted-foreground italic mt-0.5 line-clamp-1 break-words">{a.notes}</p>}
                      </div>
                      {renderActions(a)}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Right: map overview */}
            <div className="order-1 lg:order-2 lg:sticky lg:top-6 lg:self-start">
              <MapView
                pins={mapPins}
                fitToPins
                plainPins
                focus={focus}
                className="h-[280px] lg:h-[calc(100vh-220px)]"
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="deliveries" className="mt-4">
          <DeliveriesPanel />
        </TabsContent>
      </Tabs>

      {/* Add/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? 'Edit' : 'Add'} Address</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Westlands Pickup Point" />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={v => setType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pickup">Pickup Point</SelectItem>
                  <SelectItem value="delivery">Delivery Address</SelectItem>
                  <SelectItem value="branch">Branch</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Full Address</Label>
              <Input value={fullAddress} onChange={e => setFullAddress(e.target.value)} placeholder="Full street address" />
            </div>

            {/* Search / Coordinates / Plus code ribbon */}
            <LocationTabs onPick={handlePick} />

            <MapView
              compact
              className="h-[220px]"
              onClick={handleMapClick}
              selectedPin={selectedPin}
              center={selectedPin || undefined}
            />
            <PinStatus
              text={selectedPin ? (fullAddress || coordinates) : null}
              extra={selectedPin && fullAddress ? coordinates : null}
            />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Plus Code</Label>
                <Input value={plusCode} onChange={e => setPlusCode(e.target.value)} placeholder="e.g. 6GCRMQFG+R8" />
              </div>
              <div>
                <Label>Coordinates</Label>
                <Input value={coordinates} onChange={e => handleCoordsChange(e.target.value)} placeholder="-1.2921,36.8219" />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editId ? 'Update' : 'Add Address'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
