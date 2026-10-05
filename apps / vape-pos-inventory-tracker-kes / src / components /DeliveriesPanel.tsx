import { useEffect, useMemo, useState } from 'react';
import { getSales, getCustomers, saveCustomerLocation } from 'zitejs/api';
import { Card, CardContent } from '@project/components/ui/card';
import { Button } from '@project/components/ui/button';
import { Switch } from '@project/components/ui/switch';
import { Label } from '@project/components/ui/label';
import { MapPin, Users, UserCheck, BookmarkPlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useBranch } from '../hooks/useBranch';
import DateRangeFilter, { Range, inRange } from './DateRangeFilter';
import DeliveryHeatMap, { HeatMetric, HeatPoint } from './DeliveryHeatMap';
import { parseCoordinates } from '../lib/geocode';

interface Drop {
  saleId: string;
  customerId: string | null;
  lat: number;
  lng: number;
  label: string;
  revenue: number;
  date: string;
}

interface Spot {
  key: string;
  lat: number;
  lng: number;
  label: string;
  orders: number;
  revenue: number;
  customers: Map<string, { id: string; orders: number; revenue: number; latest: Drop }>;
  walkIns: number;
}

const fmt = (n: number) => `KES ${Math.round(n).toLocaleString()}`;
const keyOf = (lat: number, lng: number) => `${lat.toFixed(4)},${lng.toFixed(4)}`;
const domId = (k: string) => `spot-${k.replace(/[^0-9-]/g, '_')}`;

/**
 * Reads the drop-off pins of a sale. New sales store tagged points ("dropoff:lat,lng → pickup:lat,lng").
 * Older sales stored plain "lat,lng → lat,lng"; for those the last point is taken as the drop-off.
 */
function parseDrops(coords?: string | null, addr?: string | null): { lat: number; lng: number; label: string }[] {
  const parsed = (coords || '')
    .split('→')
    .map(s => s.trim())
    .filter(Boolean)
    .map(p => {
      const m = /^(?:([a-z]+):)?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/i.exec(p);
      return m ? { tag: m[1]?.toLowerCase(), lat: parseFloat(m[2]), lng: parseFloat(m[3]) } : null;
    })
    .filter((x): x is { tag: string | undefined; lat: number; lng: number } => !!x);
  if (parsed.length === 0) return [];
  const labels = (addr || '').split(';').map(s => s.trim()).filter(Boolean);
  const tagged = parsed.some(p => p.tag);
  if (tagged) {
    return parsed
      .filter(p => p.tag === 'dropoff')
      .map((p, i) => ({ lat: p.lat, lng: p.lng, label: labels[i] || `${p.lat.toFixed(5)},${p.lng.toFixed(5)}` }));
  }
  const last = parsed[parsed.length - 1];
  return [{ lat: last.lat, lng: last.lng, label: labels[labels.length - 1] || `${last.lat.toFixed(5)},${last.lng.toFixed(5)}` }];
}

export default function DeliveriesPanel() {
  const { currentBranch } = useBranch();
  const [allOutlets, setAllOutlets] = useState(false);
  const [range, setRange] = useState<Range>({});
  const [sales, setSales] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<HeatMetric>('orders');
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([
        getSales({ branchId: allOutlets ? undefined : currentBranch?.id }),
        getCustomers({}),
      ]);
      setSales(s.sales as any[]);
      setCustomers(c.customers as any[]);
    } catch {
      toast.error('Failed to load deliveries');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [allOutlets, currentBranch?.id]);

  const customerMap = useMemo(() => new Map<string, any>(customers.map(c => [c.id, c])), [customers]);

  const drops = useMemo(() => {
    const out: Drop[] = [];
    for (const s of sales) {
      if (s.status !== 'Completed' || !inRange(range, s.saleDate)) continue;
      const ds = parseDrops(s.deliveryCoordinates, s.deliveryAddress);
      if (ds.length === 0) continue;
      const customerId = Array.isArray(s.customer) ? s.customer[0] || null : s.customer || null;
      ds.forEach(d => out.push({ saleId: s.id, customerId, lat: d.lat, lng: d.lng, label: d.label, revenue: (s.total || 0) / ds.length, date: s.saleDate || '' }));
    }
    return out;
  }, [sales, range]);

  const spots = useMemo(() => {
    const map = new Map<string, Spot>();
    for (const d of drops) {
      const k = keyOf(d.lat, d.lng);
      let sp = map.get(k);
      if (!sp) {
        sp = { key: k, lat: d.lat, lng: d.lng, label: d.label, orders: 0, revenue: 0, customers: new Map(), walkIns: 0 };
        map.set(k, sp);
      }
      sp.orders += 1;
      sp.revenue += d.revenue;
      if (d.customerId) {
        const c = sp.customers.get(d.customerId) || { id: d.customerId, orders: 0, revenue: 0, latest: d };
        c.orders += 1;
        c.revenue += d.revenue;
        if (d.date >= c.latest.date) c.latest = d;
        sp.customers.set(d.customerId, c);
      } else {
        sp.walkIns += 1;
      }
    }
    const val = (s: Spot) => (metric === 'orders' ? s.orders : s.revenue);
    return Array.from(map.values()).sort((a, b) => val(b) - val(a));
  }, [drops, metric]);

  const heatPoints: HeatPoint[] = useMemo(
    () => spots.map(s => ({ key: s.key, lat: s.lat, lng: s.lng, label: s.label, orders: s.orders, revenue: s.revenue })),
    // Re-pin only when the underlying drops change, not when the sort order flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drops],
  );

  const isSaved = (customerId: string, d: Drop) => {
    const p = parseCoordinates(customerMap.get(customerId)?.coordinates);
    return !!p && keyOf(p.lat, p.lng) === keyOf(d.lat, d.lng);
  };

  const saveOne = async (customerId: string, d: Drop, quiet = false) => {
    const coordinates = `${d.lat.toFixed(6)},${d.lng.toFixed(6)}`;
    await saveCustomerLocation({ customerId, address: d.label, coordinates });
    setCustomers(prev => prev.map(c => (c.id === customerId ? { ...c, address: d.label, coordinates } : c)));
    if (!quiet) toast.success('Drop-off pin saved as the customer address');
  };

  const handleSave = async (customerId: string, d: Drop) => {
    setSavingId(customerId + d.date);
    try { await saveOne(customerId, d); }
    catch (e: any) { toast.error(e.message || 'Could not save'); }
    finally { setSavingId(null); }
  };

  // Each customer's most recent drop-off that isn't already their saved location.
  const pendingSaves = useMemo(() => {
    const latest = new Map<string, Drop>();
    for (const d of drops) {
      if (!d.customerId) continue;
      const cur = latest.get(d.customerId);
      if (!cur || d.date >= cur.date) latest.set(d.customerId, d);
    }
    return Array.from(latest.entries()).filter(([id, d]) => customerMap.has(id) && !isSaved(id, d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drops, customerMap]);

  const handleBulk = async () => {
    if (pendingSaves.length === 0) return;
    if (!window.confirm(`Save each customer's latest drop-off pin as their address? This updates ${pendingSaves.length} customer(s) and replaces their current address and coordinates.`)) return;
    setBulkSaving(true);
    let ok = 0;
    for (const [id, d] of pendingSaves) {
      try { await saveOne(id, d, true); ok++; } catch {}
    }
    setBulkSaving(false);
    toast.success(`Saved ${ok} customer address${ok === 1 ? '' : 'es'}`);
  };

  const selectSpot = (s: { key: string; lat: number; lng: number }) => {
    setActiveKey(s.key);
    setFocus({ lat: s.lat, lng: s.lng });
  };
  const fromMarker = (key: string) => {
    setActiveKey(key);
    document.getElementById(domId(key))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <DateRangeFilter value={range} onChange={setRange} />
        <div className="flex rounded-md border border-border p-0.5">
          {(['orders', 'revenue'] as HeatMetric[]).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              aria-pressed={metric === m}
              className={`h-7 px-3 rounded text-xs font-medium transition-colors ${metric === m ? 'bg-pink-500 text-white' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {m === 'orders' ? 'Number of orders' : 'Revenue (KES)'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Switch id="all-outlets" checked={allOutlets} onCheckedChange={setAllOutlets} />
          <Label htmlFor="all-outlets" className="text-xs">All outlets</Label>
        </div>
        <Button size="sm" className="ml-auto" onClick={handleBulk} disabled={bulkSaving || pendingSaves.length === 0}>
          {bulkSaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <BookmarkPlus className="w-4 h-4 mr-1" />}
          Save all pins to customers ({pendingSaves.length})
        </Button>
      </div>

      {/* List column is 0.65 of its former width (300–380px → 195–247px); the map takes all the freed space. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(195px,247px)_1fr]">
        <div className="space-y-2 lg:max-h-[calc(100vh-190px)] lg:overflow-y-auto lg:pr-1 order-2 lg:order-1">
          {loading ? (
            [...Array(4)].map((_, i) => (
              <Card key={i} className="bg-card border-border"><CardContent className="p-3"><div className="h-12 bg-muted rounded animate-pulse" /></CardContent></Card>
            ))
          ) : spots.length === 0 ? (
            <Card className="bg-card border-border">
              <CardContent className="p-6 text-center text-muted-foreground">
                <MapPin className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No delivery drop-offs yet. Plan a route with a Drop-off pin at POS and complete the sale.</p>
              </CardContent>
            </Card>
          ) : spots.map(s => (
            <Card
              id={domId(s.key)}
              key={s.key}
              onClick={() => selectSpot(s)}
              className={`bg-card cursor-pointer transition-colors ${activeKey === s.key ? 'border-primary' : 'border-border'}`}
            >
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground break-words leading-snug">{s.label}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {s.orders} order{s.orders === 1 ? '' : 's'} · {fmt(s.revenue)}
                    </p>
                  </div>
                </div>
                {(s.customers.size > 0 || s.walkIns > 0) && (
                  <div className="space-y-1.5 border-t border-border pt-2" onClick={e => e.stopPropagation()}>
                    {Array.from(s.customers.values()).map(c => {
                      const cust = customerMap.get(c.id);
                      const saved = isSaved(c.id, c.latest);
                      return (
                        <div key={c.id} className="space-y-1 text-xs">
                          <div className="flex items-start gap-1.5">
                            <Users className="w-3 h-3 mt-0.5 text-muted-foreground shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-foreground break-words leading-snug">{cust?.customerName || 'Customer'}</p>
                              <p className="text-[10px] text-muted-foreground">{c.orders} order{c.orders === 1 ? '' : 's'} · {fmt(c.revenue)}</p>
                            </div>
                            {saved && (
                              <span className="flex items-center gap-1 text-[10px] text-emerald-400 shrink-0 ml-auto"><UserCheck className="w-3 h-3" /> Saved</span>
                            )}
                          </div>
                          {!saved && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[10px] ml-[18px] border-amber-400/70"
                              disabled={savingId === c.id + c.latest.date}
                              onClick={() => handleSave(c.id, c.latest)}
                              title="Save this pin as the customer's address"
                            >
                              {savingId === c.id + c.latest.date ? '...' : 'Save as address'}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                    {s.walkIns > 0 && (
                      <p className="text-[10px] text-muted-foreground">{s.walkIns} order{s.walkIns === 1 ? '' : 's'} with no linked customer</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="order-1 lg:order-2 lg:sticky lg:top-6 lg:self-start min-w-0">
          <DeliveryHeatMap
            points={heatPoints}
            metric={metric}
            focus={focus}
            onSelect={fromMarker}
            className="h-[300px] lg:h-[calc(100vh-190px)]"
          />
        </div>
      </div>
    </div>
  );
}
