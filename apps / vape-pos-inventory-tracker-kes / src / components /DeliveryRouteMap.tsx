import { useState, useEffect, useRef, useCallback, useMemo, ReactNode } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import { getAddresses } from 'zitejs/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Switch } from '@project/components/ui/switch';
import { Button } from '@project/components/ui/button';
import { Checkbox } from '@project/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@project/components/ui/dialog';
import { cn } from '@project/components/lib/utils';
import { Trash2, BookMarked, Loader2, Clock, Flag, RefreshCw, PackageCheck, Search } from 'lucide-react';
import LocationTabs, { PinStatus } from './LocationTabs';
import { geocode } from '../lib/geocode';
import { numberedPin } from '../lib/pinIcon';
import { addrTypeLabel, defaultRouteTag, normalizeAddrType } from '../lib/addressTypes';

export interface RoutePoint {
  id: string;
  label: string;
  tag?: 'start' | 'pickup' | 'dropoff' | 'end';
  lat: number;
  lng: number;
  /** Set when the point came from a Supplier-type saved location. */
  supplierId?: string;
  supplierName?: string;
}

/** An item in the active order (and merged orders) that can be picked up from a supplier. */
export interface PickupItem {
  productId: string;
  name: string;
  quantity: number;
  unitCost: number;
}

interface Props {
  points: RoutePoint[];
  onPointsChange: (points: RoutePoint[]) => void;
  totalDistance: number;
  onDistanceChange: (km: number) => void;
  /** Items in the POS cart plus any merged pending orders. */
  pickupItems?: PickupItem[];
  /** Selected product ids per route point id. */
  pickupSelections?: Record<string, string[]>;
  onPickupSelectionsChange?: (s: Record<string, string[]>) => void;
  /** Extra button(s) shown on the same row as the Saved Addresses button (e.g. Merge Orders). */
  extraActions?: ReactNode;
}

const tagColors: Record<string, string> = {
  start: '#22c55e',
  pickup: '#3b82f6',
  dropoff: '#ef4444',
  end: '#a855f7',
};

const tagLabels: Record<string, string> = {
  start: 'Start',
  pickup: 'Pick-up',
  dropoff: 'Drop-off',
  end: 'End',
};

type DistanceMode = 'DRIVE' | 'mixed';
const distanceModeLabels: Record<DistanceMode, string> = {
  DRIVE: 'shortest driving distance',
  mixed: 'some legs had no road route — dashed lines are straight-line estimates',
};

// Rough average speed (km/h) used only when Google can't return a road route for a leg.
const FALLBACK_SPEED_KMH = 20;

// Remembered between openings of the dialog (resets on page reload).
let rememberedReturnToStart = true;

type Target = 'start' | 'stops' | 'end';

interface TripInfo {
  /** Total driving time including live traffic, in seconds. */
  seconds: number;
  /** Total driving time with no traffic, in seconds. */
  staticSeconds: number;
  /** When the calculation was made (ms since epoch); the trip is assumed to leave then. */
  calcAt: number;
  /** True if any leg used a straight-line estimate instead of a real route. */
  estimated: boolean;
}

function formatDuration(totalSeconds: number): string {
  const mins = Math.max(1, Math.round(totalSeconds / 60));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

function formatClock(ms: number, withDate: boolean): string {
  const d = new Date(ms);
  const time = d.toLocaleTimeString('en-KE', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Africa/Nairobi' });
  if (!withDate) return time;
  const day = d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', timeZone: 'Africa/Nairobi' });
  return `${time} (${day})`;
}

function decodePolyline(str: string) {
  const out: google.maps.LatLng[] = []; let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const k of [0, 1]) {
      let shift = 0, result = 0, byte: number;
      do { byte = str.charCodeAt(i++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (k === 0) lat += d; else lng += d;
    }
    out.push(new google.maps.LatLng(lat / 1e5, lng / 1e5));
  }
  return out;
}

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

let nextId = 1;
function genId() { return `rp_${nextId++}_${Date.now()}`; }

interface SavedAddr { id: string; addressName?: string; type?: string; coordinates?: string; fullAddress?: string; supplierId?: string | null; supplierName?: string; }

interface PointExtra { supplierId?: string; supplierName?: string; tag?: 'pickup' | 'dropoff'; }

export default function DeliveryRouteMap({
  points, onPointsChange, totalDistance, onDistanceChange,
  pickupItems = [], pickupSelections = {}, onPickupSelectionsChange, extraActions,
}: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  // The map click handler is registered once, so it reads the latest points/callback from refs.
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const onPointsChangeRef = useRef(onPointsChange);
  onPointsChangeRef.current = onPointsChange;

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [savedAddresses, setSavedAddresses] = useState<SavedAddr[]>([]);
  const [savedOpen, setSavedOpen] = useState(false);
  const [savedQuery, setSavedQuery] = useState('');
  const [distanceMode, setDistanceMode] = useState<DistanceMode | null>(null);
  const [calculatingDistance, setCalculatingDistance] = useState(false);
  const [tripInfo, setTripInfo] = useState<TripInfo | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [pickupFor, setPickupFor] = useState<RoutePoint | null>(null);

  // Which part of the route the next picked location (search, coordinates, plus code or map click) goes to.
  const [target, setTargetState] = useState<Target>(() => (points.some(p => p.tag === 'start') ? 'stops' : 'start'));
  const targetRef = useRef<Target>(target);
  targetRef.current = target;
  const setTarget = (t: Target) => { targetRef.current = t; setTargetState(t); };

  const [diffEnd, setDiffEnd] = useState(() => points.some(p => p.tag === 'end'));
  const [returnToStart, setReturnToStartState] = useState(rememberedReturnToStart);
  const setReturnToStart = (v: boolean) => { rememberedReturnToStart = v; setReturnToStartState(v); };

  const apiKey = import.meta.env.VITE_GOOGLEMAPS_API_KEY;

  const placePoint = useCallback((lat: number, lng: number, label?: string, extra?: PointExtra) => {
    const cur = pointsRef.current;
    const t = targetRef.current;
    const pt: RoutePoint = {
      id: genId(),
      label: label || `${lat.toFixed(5)},${lng.toFixed(5)}`,
      lat, lng,
      ...(extra?.supplierId ? { supplierId: extra.supplierId, supplierName: extra.supplierName } : {}),
    };
    let next: RoutePoint[];
    if (t === 'start') {
      next = [{ ...pt, tag: 'start' }, ...cur.filter(p => p.tag !== 'start')];
      targetRef.current = 'stops';
      setTargetState('stops');
    } else if (t === 'end') {
      next = [...cur.filter(p => p.tag !== 'end'), { ...pt, tag: 'end' }];
    } else {
      const stop: RoutePoint = extra?.tag ? { ...pt, tag: extra.tag } : pt;
      const endIdx = cur.findIndex(p => p.tag === 'end');
      next = endIdx >= 0 ? [...cur.slice(0, endIdx), stop, ...cur.slice(endIdx)] : [...cur, stop];
    }
    onPointsChangeRef.current(next);
  }, []);

  // Load saved addresses (the locations saved on the Addresses > Branches tab)
  useEffect(() => {
    getAddresses({}).then(res => setSavedAddresses(res.addresses as SavedAddr[])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!apiKey) { setIsLoading(false); setError('Google Maps not connected.'); return; }
    if (mapInstanceRef.current) { setIsLoading(false); return; }

    let mounted = true;
    const loader = new Loader({ apiKey, version: 'weekly', libraries: ['places'] });

    loader.importLibrary('maps').then(({ Map }) => {
      if (!mounted || !mapRef.current || mapInstanceRef.current) return;
      const map = new Map(mapRef.current, {
        center: { lat: -1.2921, lng: 36.8219 },
        zoom: 12,
        fullscreenControl: true,
        mapTypeControl: false,
        streetViewControl: false,
      });
      mapInstanceRef.current = map;

      map.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (e.latLng) placePoint(e.latLng.lat(), e.latLng.lng());
      });

      setIsLoading(false);
    }).catch(() => { if (mounted) { setIsLoading(false); setError('Failed to load Google Maps'); } });

    return () => { mounted = false; };
  }, [apiKey]);

  // Update markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    points.forEach((pt, i) => {
      const color = pt.tag ? tagColors[pt.tag] : '#6b7280';
      const marker = new google.maps.Marker({
        position: { lat: pt.lat, lng: pt.lng },
        map,
        icon: numberedPin(i + 1, color),
        title: `${pt.tag ? tagLabels[pt.tag] + ': ' : ''}${pt.label}`,
      });
      markersRef.current.push(marker);
    });

    if (points.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      points.forEach(pt => bounds.extend({ lat: pt.lat, lng: pt.lng }));
      map.fitBounds(bounds, 50);
      if (points.length === 1) map.setZoom(15);
    }
  }, [points, isLoading]);

  // The stops actually driven. When "Return to start" is on (and no different end is set),
  // a final leg back to the start location is added to the calculation.
  const startPt = points.find(p => p.tag === 'start');
  const routePts = useMemo<RoutePoint[]>(() => {
    if (returnToStart && !diffEnd && startPt && points.length >= 2 && points[points.length - 1].id !== startPt.id) {
      return [...points, { ...startPt, id: 'return-to-start', label: 'Return to start' }];
    }
    return points;
  }, [points, returnToStart, diffEnd, startPt]);

  // Shortest driving route between each pair of consecutive stops (Routes API),
  // drawn along the roads. Each leg also returns its duration using LIVE traffic
  // (routingPreference TRAFFIC_AWARE, departing now). Falls back to a dashed
  // straight line if no route is found.
  useEffect(() => {
    const map = mapInstanceRef.current;
    let cancelled = false;
    if (routePts.length < 2) {
      polylinesRef.current.forEach(p => p.setMap(null));
      polylinesRef.current = [];
      setDistanceMode(null); setTripInfo(null); onDistanceChange(0);
      return;
    }
    if (!map) return;
    setCalculatingDistance(true);
    // Remove any lines from a previous calculation (e.g. when refreshing live traffic).
    polylinesRef.current.forEach(p => p.setMap(null));
    polylinesRef.current = [];
    const calcAt = Date.now();
    const legs = routePts.slice(0, -1).map((a, i) => [a, routePts[i + 1]] as const);
    const wp = (p: RoutePoint) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
    // Routes API durations come back as strings like "1234s".
    const secs = (s?: string) => { const n = s ? parseInt(s, 10) : NaN; return Number.isFinite(n) ? n : NaN; };
    Promise.all(legs.map(([a, b]) =>
      fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.staticDuration,routes.polyline.encodedPolyline',
        },
        body: JSON.stringify({
          origin: wp(a),
          destination: wp(b),
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_AWARE',
          computeAlternativeRoutes: true,
        }),
      }).then(async r => {
        if (!r.ok) { console.error('Routes API error', r.status, await r.text()); return null; }
        const data: { routes?: { distanceMeters?: number; duration?: string; staticDuration?: string; polyline?: { encodedPolyline?: string } }[] } = await r.json();
        const best = (data.routes || []).filter(x => typeof x.distanceMeters === 'number' && x.polyline?.encodedPolyline)
          .sort((x, y) => x.distanceMeters! - y.distanceMeters!)[0];
        if (!best) return null;
        const meters = best.distanceMeters!;
        const estSeconds = (meters / 1000 / FALLBACK_SPEED_KMH) * 3600;
        const live = secs(best.duration);
        const stat = secs(best.staticDuration);
        return {
          meters,
          path: decodePolyline(best.polyline!.encodedPolyline!),
          road: true,
          seconds: Number.isFinite(live) ? live : estSeconds,
          staticSeconds: Number.isFinite(stat) ? stat : (Number.isFinite(live) ? live : estSeconds),
          durationEstimated: !Number.isFinite(live),
        };
      }).catch(() => null).then(r => r || (() => {
        const meters = haversineM(a, b);
        const est = (meters / 1000 / FALLBACK_SPEED_KMH) * 3600;
        return {
          meters, path: [new google.maps.LatLng(a.lat, a.lng), new google.maps.LatLng(b.lat, b.lng)], road: false,
          seconds: est, staticSeconds: est, durationEstimated: true,
        };
      })())
    )).then(results => {
      if (cancelled) return;
      results.forEach(r => {
        polylinesRef.current.push(new google.maps.Polyline({
          path: r.path, map, strokeColor: '#3b82f6', strokeWeight: 4,
          strokeOpacity: r.road ? 0.85 : 0,
          icons: r.road ? undefined : [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.8, scale: 3 }, offset: '0', repeat: '12px' }],
        }));
      });
      const total = results.reduce((s, r) => s + r.meters, 0);
      onDistanceChange(Math.round(total / 10) / 100);
      setDistanceMode(results.every(r => r.road) ? 'DRIVE' : 'mixed');
      setTripInfo({
        seconds: results.reduce((s, r) => s + r.seconds, 0),
        staticSeconds: results.reduce((s, r) => s + r.staticSeconds, 0),
        calcAt,
        estimated: results.some(r => r.durationEstimated),
      });
    }).finally(() => { if (!cancelled) setCalculatingDistance(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routePts, isLoading, refreshTick]);

  const handleSavedAddress = async (addrId: string) => {
    const addr = savedAddresses.find(a => a.id === addrId);
    if (!addr) return;
    const isSupplier = normalizeAddrType(addr.type) === 'supplier' && !!addr.supplierId;
    const extra: PointExtra = {
      tag: defaultRouteTag(addr.type),
      ...(isSupplier ? { supplierId: addr.supplierId!, supplierName: addr.supplierName } : {}),
    };
    const label = addr.addressName || addr.fullAddress || addr.coordinates;
    if (addr.coordinates) {
      const parts = addr.coordinates.split(',').map(s => s.trim());
      if (parts.length === 2) {
        const lat = parseFloat(parts[0]), lng = parseFloat(parts[1]);
        if (isFinite(lat) && isFinite(lng)) {
          placePoint(lat, lng, label, extra);
          return;
        }
      }
    }
    // No coordinates saved: look the address up on Google Maps
    const text = addr.fullAddress || addr.addressName || '';
    if (text) {
      const out = await geocode(text);
      const r = out.results[0];
      if (r) placePoint(r.lat, r.lng, addr.addressName || addr.fullAddress || r.address, extra);
    }
  };

  const pickSaved = (addrId: string) => {
    setSavedOpen(false);
    setSavedQuery('');
    handleSavedAddress(addrId);
  };

  const filteredSaved = savedAddresses.filter(a => {
    const q = savedQuery.trim().toLowerCase();
    if (!q) return true;
    return [a.addressName, a.fullAddress, a.supplierName, addrTypeLabel(a.type)].some(v => (v || '').toLowerCase().includes(q));
  });

  const updateTag = (id: string, tag: string) => {
    onPointsChange(points.map(p => p.id === id ? { ...p, tag: tag === 'none' ? undefined : tag as any } : p));
  };

  const removePoint = (id: string) => {
    onPointsChange(points.filter(p => p.id !== id));
  };

  const toggleDiffEnd = (on: boolean) => {
    setDiffEnd(on);
    if (on) {
      setTarget('end');
    } else {
      onPointsChange(points.filter(p => p.tag !== 'end'));
      if (targetRef.current === 'end') setTarget('stops');
    }
  };

  // ── Picked-up items (supplier pick-up points only) ──
  const selectedFor = (id: string) =>
    (pickupSelections[id] || []).filter(pid => pickupItems.some(i => i.productId === pid));
  const dialogSel = pickupFor ? selectedFor(pickupFor.id) : [];
  const setDialogSel = (ids: string[]) => {
    if (pickupFor && onPickupSelectionsChange) onPickupSelectionsChange({ ...pickupSelections, [pickupFor.id]: ids });
  };
  const allPicked = pickupItems.length > 0 && dialogSel.length === pickupItems.length;
  const toggleItem = (pid: string) =>
    setDialogSel(dialogSel.includes(pid) ? dialogSel.filter(x => x !== pid) : [...dialogSel, pid]);

  // Final drop-off = moment the route was calculated + live-traffic driving time.
  const arrivalMs = tripInfo ? tripInfo.calcAt + tripInfo.seconds * 1000 : 0;
  const arrivesNextDay = tripInfo ? new Date(arrivalMs).toDateString() !== new Date(tripInfo.calcAt).toDateString() : false;
  const trafficDelaySec = tripInfo ? tripInfo.seconds - tripInfo.staticSeconds : 0;

  const endPt = points.find(p => p.tag === 'end');
  const stopCount = points.filter(p => p.tag !== 'start' && p.tag !== 'end').length;
  const panelTitle = target === 'start' ? 'Start location' : target === 'end' ? 'End location' : 'Stops (pick-ups & drop-offs)';
  const statusText =
    target === 'start' ? (startPt?.label ?? null)
    : target === 'end' ? (endPt?.label ?? null)
    : stopCount > 0 ? `${stopCount} stop${stopCount === 1 ? '' : 's'} added — search or click the map to add more` : null;

  const chips: { key: Target; label: string }[] = [
    { key: 'start', label: 'Start' },
    { key: 'stops', label: 'Stops' },
    ...(diffEnd ? [{ key: 'end' as Target, label: 'End' }] : []),
  ];

  return (
    <div className="space-y-3">
      {/* Saved Addresses + (Merge Orders) buttons, side by side */}
      <div className="grid grid-cols-2 gap-2">
        {savedAddresses.length > 0 && (
          <Button type="button" variant="outline" className="h-9 text-xs border-amber-400/70 hover:border-amber-400" onClick={() => setSavedOpen(true)}>
            <BookMarked className="w-3.5 h-3.5 mr-1.5 shrink-0" /> <span className="truncate">Saved Addresses</span>
          </Button>
        )}
        {extraActions}
      </div>

      {/* Location panel: title, Search / Coordinates / Plus code ribbon, map, pin status, toggles */}
      <div className="rounded-xl border border-border bg-card/60 p-3 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm font-semibold text-foreground">{panelTitle}</p>
          <div className="flex gap-1">
            {chips.map(c => (
              <button
                key={c.key}
                type="button"
                onClick={() => setTarget(c.key)}
                aria-pressed={target === c.key}
                className={cn(
                  'h-6 px-2 rounded-full text-[10px] font-medium border transition-colors',
                  target === c.key ? 'border-pink-500 bg-pink-500 text-white' : 'border-border text-muted-foreground hover:border-pink-500/60',
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <LocationTabs onPick={(lat, lng, address) => placePoint(lat, lng, address)} />

        {/* Map */}
        <div className="relative w-full rounded-lg overflow-hidden h-[250px]">
          <div ref={mapRef} className="w-full h-full" />
          {isLoading && <div className="absolute inset-0 flex items-center justify-center bg-background/80 text-muted-foreground text-sm">Loading map...</div>}
          {error && <div className="absolute inset-0 flex items-center justify-center bg-background text-red-500 text-sm">{error}</div>}
        </div>

        <PinStatus text={statusText} />

        <div className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="diff-end" className="text-sm font-normal text-foreground">Set a different end location</Label>
            <Switch id="diff-end" checked={diffEnd} onCheckedChange={toggleDiffEnd} className="data-[state=checked]:bg-pink-500" />
          </div>
          {!diffEnd && (
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="return-start" className="text-sm font-normal text-foreground">Return to start</Label>
              <Switch id="return-start" checked={returnToStart} onCheckedChange={setReturnToStart} className="data-[state=checked]:bg-pink-500" />
            </div>
          )}
        </div>
      </div>

      {/* Point list */}
      {points.length > 0 && (
        <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
          {points.map((pt, i) => {
            const isSupplierPickup = pt.tag === 'pickup' && !!pt.supplierId;
            const picked = isSupplierPickup ? selectedFor(pt.id).length : 0;
            return (
              <div key={pt.id} className="flex items-center gap-2 bg-muted/50 rounded-md px-2 py-1.5 text-xs">
                <span className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0" style={{ background: pt.tag ? tagColors[pt.tag] : '#6b7280' }}>
                  {i + 1}
                </span>
                <Select value={pt.tag || 'none'} onValueChange={val => updateTag(pt.id, val)}>
                  <SelectTrigger className="w-[90px] h-6 text-[10px] border-dashed">
                    <SelectValue placeholder="Tag" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No tag</SelectItem>
                    <SelectItem value="start">Start</SelectItem>
                    <SelectItem value="pickup">Pick-up</SelectItem>
                    <SelectItem value="dropoff">Drop-off</SelectItem>
                    <SelectItem value="end">End</SelectItem>
                  </SelectContent>
                </Select>
                <span className="flex-1 truncate text-foreground">{pt.label}</span>
                {isSupplierPickup && (
                  <button
                    type="button"
                    onClick={() => setPickupFor(pt)}
                    title={`Select items picked up from ${pt.supplierName || 'this supplier'}`}
                    className="shrink-0 flex items-center gap-1 h-6 px-2 rounded-md bg-pink-500 text-white text-[10px] font-semibold shadow-sm hover:bg-pink-600 transition-colors"
                  >
                    <PackageCheck className="w-3.5 h-3.5" />
                    Pick items{picked > 0 ? ` (${picked})` : ''}
                  </button>
                )}
                <button onClick={() => removePoint(pt.id)} className="text-destructive hover:text-red-300 shrink-0">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Trip summary: distance, live-traffic duration and final drop-off time */}
      {routePts.length >= 2 && (
        <div className="rounded-md bg-primary/10 px-3 py-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">Total Distance</span>
            <span className="text-sm font-bold text-primary flex items-center gap-1.5">
              {calculatingDistance && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {totalDistance.toFixed(2)} km
            </span>
          </div>
          {distanceMode && !calculatingDistance && (
            <p className="text-[10px] text-muted-foreground text-right">
              {distanceModeLabels[distanceMode]}{routePts !== points ? ' · includes return to start' : ''}
            </p>
          )}

          <div className="flex items-center justify-between border-t border-primary/20 pt-1.5">
            <span className="text-xs font-medium text-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Estimated Duration</span>
            <span className="text-sm font-bold text-primary">
              {tripInfo ? formatDuration(tripInfo.seconds) : '—'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground flex items-center gap-1"><Flag className="w-3 h-3" /> Final Drop-off Time</span>
            <span className="text-sm font-bold text-primary">
              {tripInfo ? formatClock(arrivalMs, arrivesNextDay) : '—'}
            </span>
          </div>
          {tripInfo && !calculatingDistance && (
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] text-muted-foreground">
                {tripInfo.estimated
                  ? 'Includes straight-line estimates (no live traffic for some legs). '
                  : trafficDelaySec >= 60
                    ? `Live traffic adds about ${formatDuration(trafficDelaySec)}. `
                    : 'Live traffic is light right now. '}
                Assumes leaving at {formatClock(tripInfo.calcAt, false)}, excluding time spent at stops.
              </p>
              <button
                type="button"
                onClick={() => setRefreshTick(t => t + 1)}
                className="shrink-0 flex items-center gap-1 text-[10px] text-primary hover:underline"
                title="Recalculate with current traffic"
              >
                <RefreshCw className="w-3 h-3" /> Refresh
              </button>
            </div>
          )}
        </div>
      )}

      {/* Saved addresses picker */}
      <Dialog open={savedOpen} onOpenChange={o => { setSavedOpen(o); if (!o) setSavedQuery(''); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><BookMarked className="w-5 h-5 text-amber-400" /> Saved Addresses</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Tap an address to add it to the route ({target === 'start' ? 'as the start' : target === 'end' ? 'as the end' : 'as a stop'}).
            </p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input value={savedQuery} onChange={e => setSavedQuery(e.target.value)} placeholder="Search saved addresses..." className="pl-8 h-9 text-xs" />
            </div>
            <div className="max-h-72 overflow-y-auto space-y-1.5">
              {filteredSaved.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No saved addresses found</p>
              ) : filteredSaved.map(a => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => pickSaved(a.id)}
                  className="w-full text-left rounded-md bg-muted/50 hover:bg-muted px-3 py-2 text-xs transition-colors"
                >
                  <p className="font-medium text-foreground break-words">{a.addressName}</p>
                  <p className="text-[10px] text-muted-foreground break-words">
                    {addrTypeLabel(a.type)}{a.supplierName ? ` · ${a.supplierName}` : ''}{a.fullAddress ? ` · ${a.fullAddress}` : ''}
                  </p>
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSavedOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Items picked up at a supplier (optional). Only items in the active cart and merged orders are listed. */}
      <Dialog open={!!pickupFor} onOpenChange={o => { if (!o) setPickupFor(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="break-words pr-6">Items picked up — {pickupFor?.supplierName || pickupFor?.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Optional. Tick the items collected from this supplier. A bill for their cost price is added to the supplier's pending bills when you check out.
            </p>
            {pickupItems.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No items in the cart yet. Add items to the POS cart first.</p>
            ) : (
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 cursor-pointer text-xs font-medium">
                  <Checkbox checked={allPicked} onCheckedChange={v => setDialogSel(v ? pickupItems.map(i => i.productId) : [])} />
                  Select all
                </label>
                <div className="max-h-64 overflow-y-auto space-y-1.5">
                  {pickupItems.map(i => (
                    <label key={i.productId} className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5 cursor-pointer text-xs">
                      <Checkbox checked={dialogSel.includes(i.productId)} onCheckedChange={() => toggleItem(i.productId)} />
                      <span className="flex-1 min-w-0 break-words">{i.name}</span>
                      <span className="shrink-0 text-muted-foreground">×{i.quantity}</span>
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground text-right">
                  Bill: KES {pickupItems.filter(i => dialogSel.includes(i.productId)).reduce((s, i) => s + i.unitCost * i.quantity, 0).toLocaleString()}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogSel([])} disabled={dialogSel.length === 0}>Clear</Button>
            <Button onClick={() => setPickupFor(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
