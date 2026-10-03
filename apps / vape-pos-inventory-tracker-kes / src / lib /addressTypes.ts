// Location types used across Addresses, Suppliers and the POS route planner.
// Older records used pickup / delivery / branch / other; normalizeAddrType maps them onto the new four.

export type AddrType = 'supplier' | 'pickup' | 'dropoff' | 'startend';

export const ADDR_TYPES: { value: AddrType; label: string }[] = [
  { value: 'supplier', label: 'Supplier' },
  { value: 'pickup', label: 'Pick-up' },
  { value: 'dropoff', label: 'Drop-off' },
  { value: 'startend', label: 'Start/End' },
];

export function normalizeAddrType(t?: string | null): AddrType {
  const v = (t || '').toLowerCase().replace(/[^a-z]/g, '');
  if (v === 'supplier') return 'supplier';
  if (v === 'pickup' || v === 'pickuppoint') return 'pickup';
  if (v === 'delivery' || v === 'dropoff' || v === 'deliveryaddress') return 'dropoff';
  return 'startend';
}

export const addrTypeLabel = (t?: string | null) =>
  ADDR_TYPES.find(x => x.value === normalizeAddrType(t))?.label || 'Start/End';

export const addrPinColor = (t?: string | null) => {
  switch (normalizeAddrType(t)) {
    case 'supplier': return '#f59e0b';
    case 'pickup': return '#3b82f6';
    case 'dropoff': return '#ef4444';
    default: return '#22c55e';
  }
};

/** The route tag a saved address gets by default when it is added to a POS route. */
export const defaultRouteTag = (t?: string | null): 'pickup' | 'dropoff' | undefined => {
  switch (normalizeAddrType(t)) {
    case 'supplier':
    case 'pickup': return 'pickup';
    case 'dropoff': return 'dropoff';
    default: return undefined;
  }
};
