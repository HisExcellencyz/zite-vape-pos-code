import { useEffect, useState } from 'react';
import { getCustomerDetails, saveCustomerLocation } from 'zitejs/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@project/components/ui/dialog';
import { Button } from '@project/components/ui/button';
import { MapPin } from 'lucide-react';
import { toast } from 'sonner';
import MapView from './MapView';
import LocationPickerDialog from './LocationPickerDialog';
import { parseCoordinates } from '../lib/geocode';
import { usePermissions } from '../hooks/usePermissions';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: { id: string; customerName?: string } | null;
  /** Called with the new location after "Update". */
  onChanged: (loc: { address: string; coordinates: string }) => void;
}

/**
 * Shows a customer's current saved location. "Retain" keeps it; "Update" picks a new one,
 * which replaces it. The replaced location is archived and only visible from Customers.
 */
export default function CustomerLocationDialog({ open, onOpenChange, customer, onChanged }: Props) {
  const { can } = usePermissions();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState('');
  const [archived, setArchived] = useState(0);
  const [picker, setPicker] = useState(false);

  useEffect(() => {
    if (!open || !customer) return;
    setLoading(true);
    getCustomerDetails({ customerId: customer.id })
      .then(res => {
        const c: any = res.customer;
        setAddress(c?.address || '');
        setCoords(c?.coordinates || '');
        setArchived((res.previousLocations || []).length);
      })
      .catch(() => toast.error('Could not load the customer location'))
      .finally(() => setLoading(false));
  }, [open, customer?.id]);

  const pin = parseCoordinates(coords);

  const handleNew = async (newAddress: string, newCoords: string) => {
    if (!customer) return;
    setSaving(true);
    try {
      await saveCustomerLocation({ customerId: customer.id, coordinates: newCoords, address: newAddress });
      toast.success('Location updated. The previous one is archived under Customers.');
      onChanged({ address: newAddress, coordinates: newCoords });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Could not update the location');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 break-words pr-6"><MapPin className="w-5 h-5 text-amber-400 shrink-0" /> {customer?.customerName || 'Customer'} — saved location</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Loading...</p>
            ) : pin || address ? (
              <>
                {pin && <MapView compact plainPins fitToPins pins={[{ lat: pin.lat, lng: pin.lng }]} className="h-[190px]" />}
                <p className="text-sm text-foreground break-words">{address || coords}</p>
                {pin && <p className="text-[10px] font-mono text-muted-foreground">{coords}</p>}
              </>
            ) : (
              <p className="text-sm text-muted-foreground py-6 text-center">This customer has no saved location yet.</p>
            )}
            {archived > 0 && <p className="text-[11px] text-muted-foreground">{archived} previous location{archived === 1 ? '' : 's'} archived (visible under Customers).</p>}
          </div>
          <DialogFooter>
            <Button className="bg-blue-500 hover:bg-blue-600 text-white" disabled={!pin && !address} onClick={() => onOpenChange(false)}>Retain</Button>
            <Button
              className="bg-pink-500 hover:bg-pink-600 text-white"
              disabled={saving || !can('customers', 'edit')}
              title={can('customers', 'edit') ? 'Choose a new location' : 'You do not have permission to edit customers'}
              onClick={() => setPicker(true)}
            >
              {saving ? 'Saving...' : 'Update'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <LocationPickerDialog open={picker} onOpenChange={setPicker} title="New customer location" value={address} onSelect={handleNew} />
    </>
  );
}
