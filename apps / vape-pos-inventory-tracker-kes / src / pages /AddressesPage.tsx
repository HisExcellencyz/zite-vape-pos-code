import { useState, useEffect, useRef } from 'react';
import { getAddresses, saveAddress, deleteRecord, getSuppliers, syncSupplierAddresses } from 'zitejs/api';
import { usePermissions } from '../hooks/usePermissions';
import { Card, CardContent } from '@project/components/ui/card';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
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
import { ADDR_TYPES, AddrType, addrPinColor, normalizeAddrType } from '../lib/addressTypes';

interface Address {
  id: string;
  addressName?: string;
  type?: string;
  supplierId?: string | null;
  supplierName?: string;
  fullAddress?: string;
  plusCode?: string;
  coordinates?: string;
  notes?: string;
  active?: boolean;
}

interface SupplierLite { id: string; supplierName?: string; }

export default function AddressesPage() {
  const { can } = usePermissions();
  const synced = useRef(false);
  const [tab, setTab] = useState('branches');
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null);

  // Form
  const [editId, setEditId] = useState<string | undefined>();
  const [name, setName] = useState('');
  const [type, setType] = useState<AddrType>('pickup');
  const [supplierId, setSupplierId] = useState('');
  const [fullAddress, setFullAddress] = useState('');
  const [plusCode, setPlusCode] = useState('');
  const [coordinates, setCoordinates] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedPin, setSelectedPin] = useState<{ lat: number; lng: number } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      // Addresses and suppliers are shared by every outlet, so nothing is filtered by outlet here.
      // Every supplier has a Supplier-type location: back-fill older suppliers once per visit.
      if (!synced.current) { synced.current = true; await syncSupplierAddresses({}).catch(() => {}); }
      const [res, sup] = await Promise.all([getAddresses({}), getSuppliers({})]);
      setAddresses(res.addresses as Address[]);
      setSuppliers(sup.suppliers as SupplierLite[]);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditId(undefined); setName(''); setType('pickup'); setSupplierId('');
    setFullAddress(''); setPlusCode(''); setCoordinates('');
    setNotes(''); setSelectedPin(null); setShowForm(true);
  };

  const openEdit = (a: Address) => {
    setEditId(a.id); setName(a.addressName || '');
    setType(normalizeAddrType(a.type));
    setSupplierId(a.supplierId || '');
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
    if (type === 'supplier' && !supplierId) return toast.error('Choose which supplier this location belongs to');
    setSaving(true);
    try {
      await saveAddress({
        id: editId,
        addressName: name,
        type,
        supplierId: type === 'supplier' ? supplierId : undefined,
        fullAddress: fullAddress || undefined,
        plusCode: plusCode || undefined,
        coordinates: coordinates || undefined,
        notes: notes || undefined,
      });
      toast.success(editId ? 'Location updated' : 'Location added');
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
    .map(x => ({ lat: x.p!.lat, lng: x.p!.lng, label: x.a.addressName || '', color: addrPinColor(x.a.type) }));

  const renderActions = (a: Address) => (
    <div className="flex gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
      {can('addresses', 'edit') && <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(a)}><Edit className="w-3 h-3" /></Button>}
      {can('addresses', 'delete') && <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive"><Trash2 className="w-3 h-3" /></Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete this location?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(a.id)}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>}
    </div>
  );

  return (
    <div className="p-3 space-y-2">
      <Tabs value={tab} onValueChange={setTab}>
        {/* Row 1: title (and add button). Row 2: the ribbon tabs, below the title */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-foreground leading-tight">Addresses</h1>
            <span className="text-xs text-muted-foreground">
              {tab === 'branches' ? `${addresses.length} locations saved` : 'Where your orders are delivered'}
            </span>
          </div>
          {tab === 'branches' && can('addresses', 'create') && (
            <Button size="sm" className="h-8" onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Add Location</Button>
          )}
        </div>
        <TabsList className="bg-muted mt-1.5">
          <TabsTrigger value="branches">Branches</TabsTrigger>
          {can('deliveries', 'view') && <TabsTrigger value="deliveries">Deliveries</TabsTrigger>}
        </TabsList>

        <TabsContent value="branches" className="mt-2">
          <div className="grid gap-3 lg:grid-cols-[minmax(170px,220px)_1fr]">
            {/* Left: narrow location tiles (type is not shown) */}
            <div className="space-y-1.5 lg:max-h-[calc(100vh-112px)] lg:overflow-y-auto lg:pr-1 order-2 lg:order-1">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <Card key={i} className="bg-card border-border"><CardContent className="p-2"><div className="h-8 bg-muted rounded animate-pulse" /></CardContent></Card>
                ))
              ) : addresses.length === 0 ? (
                <Card className="bg-card border-border">
                  <CardContent className="p-6 text-center text-muted-foreground">
                    <MapPin className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No locations yet. Add your commonly used supplier, pick-up, drop-off and start/end points.</p>
                  </CardContent>
                </Card>
              ) : addresses.map(a => (
                <Card
                  key={a.id}
                  onClick={() => selectTile(a)}
                  className={`bg-card cursor-pointer transition-colors ${activeId === a.id ? 'border-primary' : 'border-border'}`}
                >
                  <CardContent className="p-2">
                    <div className="flex items-start gap-1.5">
                      <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: addrPinColor(a.type) }} />
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-xs text-foreground break-words leading-snug">{a.addressName}</h3>
                        {a.fullAddress && <p className="text-[11px] text-muted-foreground line-clamp-2 break-words">{a.fullAddress}</p>}
                        {a.notes && <p className="text-[10px] text-muted-foreground italic line-clamp-1 break-words">{a.notes}</p>}
                      </div>
                    </div>
                    <div className="flex justify-end mt-0.5">{renderActions(a)}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Right: large map overview */}
            <div className="order-1 lg:order-2 lg:sticky lg:top-3 lg:self-start">
              <MapView
                pins={mapPins}
                fitToPins
                plainPins
                focus={focus}
                className="h-[320px] lg:h-[calc(100vh-112px)]"
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="deliveries" className="mt-2">
          <DeliveriesPanel />
        </TabsContent>
      </Tabs>

      {/* Add/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? 'Edit' : 'Add'} Location</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Westlands Pick-up Point" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Location type</Label>
                <Select value={type} onValueChange={v => setType(v as AddrType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ADDR_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {type === 'supplier' && (
                <div>
                  <Label>Supplier *</Label>
                  <Select value={supplierId} onValueChange={setSupplierId}>
                    <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                    <SelectContent>
                      {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.supplierName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
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
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editId ? 'Update' : 'Add Location'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
