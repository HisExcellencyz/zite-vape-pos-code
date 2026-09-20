import { useState, useEffect } from 'react';
import { getAddresses, saveAddress, deleteRecord } from 'zitejs/api';
import { Card, CardContent } from '@project/components/ui/card';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Badge } from '@project/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@project/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@project/components/ui/alert-dialog';
import { Plus, MapPin, Trash2, Edit } from 'lucide-react';
import { toast } from 'sonner';
import MapView from '../components/MapView';
import ViewToggle, { useViewMode } from '../components/ViewToggle';

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

const typeColors: Record<string, string> = {
  pickup: 'bg-blue-500/10 text-blue-400',
  delivery: 'bg-green-500/10 text-green-400',
  branch: 'bg-purple-500/10 text-purple-400',
  other: 'bg-gray-500/10 text-gray-400',
};

const typeLabel = (t?: string) =>
  t === 'pickup' ? 'Pickup Point' : t === 'delivery' ? 'Delivery' : t === 'branch' ? 'Branch' : 'Other';

export default function AddressesPage() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useViewMode('addresses', 'grid');

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
    if (a.coordinates) {
      const [lat, lng] = a.coordinates.split(',').map(Number);
      if (lat && lng) setSelectedPin({ lat, lng });
      else setSelectedPin(null);
    } else setSelectedPin(null);
    setShowForm(true);
  };

  const handleMapClick = (lat: number, lng: number) => {
    setSelectedPin({ lat, lng });
    setCoordinates(`${lat.toFixed(6)},${lng.toFixed(6)}`);
  };

  const handleSearchSelect = (lat: number, lng: number, address: string) => {
    setSelectedPin({ lat, lng });
    setCoordinates(`${lat.toFixed(6)},${lng.toFixed(6)}`);
    if (!fullAddress) setFullAddress(address);
  };

  // Auto-pin when coordinates are typed
  const handleCoordsChange = (val: string) => {
    setCoordinates(val);
    const parts = val.split(',').map(s => s.trim());
    if (parts.length === 2) {
      const lat = parseFloat(parts[0]);
      const lng = parseFloat(parts[1]);
      if (isFinite(lat) && isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        setSelectedPin({ lat, lng });
      }
    }
  };

  // Auto-pin when plus code is typed (geocode it)
  const handlePlusCodeChange = (val: string) => {
    setPlusCode(val);
    // Plus codes look like "6GCRMQFG+R8" — at least 6 chars with a +
    if (val.length >= 6 && val.includes('+')) {
      const apiKey = import.meta.env.VITE_GOOGLEMAPS_API_KEY;
      if (apiKey) {
        fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(val)}&key=${apiKey}`)
          .then(r => r.json())
          .then(data => {
            if (data.results?.[0]?.geometry?.location) {
              const { lat, lng } = data.results[0].geometry.location;
              setSelectedPin({ lat, lng });
              setCoordinates(`${lat.toFixed(6)},${lng.toFixed(6)}`);
            }
          })
          .catch(() => {});
      }
    }
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
      load();
    } catch { toast.error('Delete failed'); }
  };

  // Map pins from all addresses with coordinates
  const mapPins = addresses
    .filter(a => a.coordinates)
    .map(a => {
      const [lat, lng] = (a.coordinates || '').split(',').map(Number);
      return { lat: lat || 0, lng: lng || 0, label: a.addressName || '' };
    })
    .filter(p => p.lat !== 0 && p.lng !== 0);

  const renderActions = (a: Address) => (
    <div className="flex gap-1">
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
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Addresses & Pickup Points</h1>
          <p className="text-sm text-muted-foreground">{addresses.length} addresses saved</p>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle value={viewMode} onChange={setViewMode} />
          <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Add Address</Button>
        </div>
      </div>

      {/* Map overview */}
      {mapPins.length > 0 && (
        <MapView pins={mapPins} className="h-[280px]" />
      )}

      {viewMode === 'grid' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            [...Array(3)].map((_, i) => (
              <Card key={i} className="bg-card border-border"><CardContent className="p-4"><div className="h-16 bg-muted rounded animate-pulse" /></CardContent></Card>
            ))
          ) : addresses.length === 0 ? (
            <Card className="col-span-full bg-card border-border">
              <CardContent className="p-12 text-center text-muted-foreground">
                <MapPin className="w-10 h-10 mx-auto mb-2 opacity-40" />
                No addresses yet. Add your commonly used pickup points and delivery addresses.
              </CardContent>
            </Card>
          ) : addresses.map(a => (
            <Card key={a.id} className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-foreground break-words whitespace-normal leading-snug">{a.addressName}</h3>
                    <Badge variant="secondary" className={`text-xs mt-1 ${typeColors[a.type || 'other']}`}>
                      {typeLabel(a.type)}
                    </Badge>
                  </div>
                  {renderActions(a)}
                </div>
                {a.fullAddress && <p className="text-xs text-muted-foreground mt-2 break-words whitespace-normal">{a.fullAddress}</p>}
                {a.plusCode && <p className="text-xs text-muted-foreground mt-1 break-all">Plus Code: {a.plusCode}</p>}
                {a.coordinates && <p className="text-xs text-muted-foreground mt-1 break-all">📍 {a.coordinates}</p>}
                {a.notes && <p className="text-xs text-muted-foreground mt-1 italic break-words whitespace-normal">{a.notes}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="bg-card border-border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left p-3 font-medium">Name</th>
                    <th className="text-left p-3 font-medium">Type</th>
                    <th className="text-left p-3 font-medium">Full Address</th>
                    <th className="text-left p-3 font-medium">Plus Code</th>
                    <th className="text-left p-3 font-medium">Coordinates</th>
                    <th className="text-left p-3 font-medium">Notes</th>
                    <th className="text-right p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [...Array(4)].map((_, i) => (
                      <tr key={i} className="border-b border-border">
                        {[...Array(7)].map((_, j) => <td key={j} className="p-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}
                      </tr>
                    ))
                  ) : addresses.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-muted-foreground">
                        <MapPin className="w-10 h-10 mx-auto mb-2 opacity-40" />
                        No addresses yet. Add your commonly used pickup points and delivery addresses.
                      </td>
                    </tr>
                  ) : addresses.map(a => (
                    <tr key={a.id} className="border-b border-border hover:bg-muted/30 align-top">
                      <td className="p-3 font-medium text-foreground break-words whitespace-normal">{a.addressName}</td>
                      <td className="p-3">
                        <Badge variant="secondary" className={`text-xs ${typeColors[a.type || 'other']}`}>{typeLabel(a.type)}</Badge>
                      </td>
                      <td className="p-3 text-muted-foreground break-words whitespace-normal max-w-xs">{a.fullAddress || '-'}</td>
                      <td className="p-3 text-muted-foreground break-all">{a.plusCode || '-'}</td>
                      <td className="p-3 text-muted-foreground break-all">{a.coordinates || '-'}</td>
                      <td className="p-3 text-muted-foreground break-words whitespace-normal max-w-xs">{a.notes || '-'}</td>
                      <td className="p-3"><div className="flex justify-end">{renderActions(a)}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Plus Code</Label>
                <Input value={plusCode} onChange={e => handlePlusCodeChange(e.target.value)} placeholder="e.g. 6GCRMQFG+R8" />
              </div>
              <div>
                <Label>Coordinates</Label>
                <Input value={coordinates} onChange={e => handleCoordsChange(e.target.value)} placeholder="-1.2921,36.8219" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Click on the map or search to set location</Label>
              <MapView
                className="h-[200px]"
                onClick={handleMapClick}
                selectedPin={selectedPin}
                center={selectedPin || undefined}
                showSearch
                onSearchSelect={handleSearchSelect}
              />
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
