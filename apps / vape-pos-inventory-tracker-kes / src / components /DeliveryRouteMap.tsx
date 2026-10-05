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
import { Trash2, BookMarked, Loader2, Clock, Flag, RefreshCw, PackageCheck, Search, ChevronUp, ChevronDown, GripVertical, Route as RouteIcon } from 'lucide-react';
import { toast } from 'sonner';
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

/**
 * Fixed route order, whatever order points were added in:
 * Start -> Pick-ups -> (untagged stops) -> Drop-offs -> End.
 * Points of the same kind keep the order they were added in.
 */
const ROUTE_RANK: Record<string, number> = { start: 0, pickup: 1, dropoff: 3, end: 4 };
export function sortRoutePoints<T extends { tag?: string }>(pts: T[]): T[] {
  return pts
    .map((p, i) => ({ p, i, r: p.tag && p.tag in ROUTE_RANK ? ROUTE_RANK[p.tag] : 2 }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(x => x.p);
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
  seconds: number;
  staticSeconds: number;
  calcAt: number;
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

/** Straight-line distance inflated by a typical road factor: used when Google can't give a road distance. */
const roadGuessM = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => haversineM(a, b) * 1.3;

/**
 * Best order of the drop-offs (indices 0..k-1). `D` is the distance matrix between the nodes
 * [anchor?, ...drop-offs, terminal?]; the anchor (last pick-up/start) and the terminal (end point) stay fixed.
 * Exact (Held-Karp) for up to 12 drop-offs, nearest-neighbour + 2-opt beyond that.
 */
function bestDropOrder(D: number[][], k: number, hasAnchor: boolean, hasTerminal: boolean): number[] {
  const a = hasAnchor ? 1 : 0;
  const t = hasTerminal ? a + k : -1;
  const between = (i: number, j: number) => D[a + i][a + j];
  const first = (j: number) => (hasAnchor ? D[0][a + j] : 0);
  const last = (j: number) => (hasTerminal ? D[a + j][t] : 0);
  const total = (o: number[]) => first(o[0]) + o.slice(1).reduce((s, v, i) => s + between(o[i], v), 0) + last(o[o.length - 1]);

  if (k <= 12) {
    const N = 1 << k;
    const dp = new Float64Array(N * k).fill(Infinity);
    const par = new Int8Array(N * k).fill(-1);
    for (let j = 0; j < k; j++) dp[(1 << j) * k + j] = first(j);
    for (let m = 1; m < N; m++) {
      for (let j = 0; j < k; j++) {
        const cur = dp[m * k + j];
        if (!(m & (1 << j)) || cur === Infinity) continue;
        for (let n = 0; n < k; n++) {
          if (m & (1 << n)) continue;
          const nm = m | (1 << n);
          const c = cur + between(j, n);
          if (c < dp[nm * k + n]) { dp[nm * k + n] = c; par[nm * k + n] = j; }
        }
      }
    }
    let bestJ = 0, best = Infinity;
    for (let j = 0; j < k; j++) {
      const c = dp[(N - 1) * k + j] + last(j);
      if (c < best) { best = c; bestJ = j; }
    }
    const order: number[] = [];
    let m = N - 1, j = bestJ;
    while (j !== -1) { order.push(j); const p = par[m * k + j]; m &= ~(1 << j); j = p; }
    return order.reverse();
  }

  // Many drop-offs: nearest neighbour, then 2-opt improvements.
  const left = new Set(Array.from({ length: k }, (_, i) => i));
  let cur = [...left].sort((x, y) => first(x) - first(y))[0];
  const order = [cur]; left.delete(cur);
  while (left.size) {
    cur = [...left].sort((x, y) => between(order[order.length - 1], x) - between(order[order.length - 1], y))[0];
    order.push(cur); left.delete(cur);
  }
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < k - 1; i++) {
      for (let j = i + 1; j < k; j++) {
        const cand = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
        if (total(cand) + 1e-6 < total(order)) { order.splice(0, k, ...cand); improved = true; }
      }
    }
  }
  return order;
}

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
  const [planning, setPlanning] = useState(false);
  const dragId = useRef<string | null>(null);

  // Which part of the route the next picked location (search, coordinates, plus code or map click) goes to.
  const [target, setTargetState] = useState<Target>(() => (points.some(p => p.tag === 'start') ? 'stops' : 'start'));
  const targetRef = useRef<Target>(target);
  targetRef.current = target;
  const setTarget = (t: Target) => { targetRef.current = t; setTargetState(t); };

  const [diffEnd, setDiffEnd] = useState(() => points.some(p => p.tag === 'end'));
  const [returnToStart, setReturnToStartState] = useState(rememberedReturnToStart);
  const setReturnToStart = (v: boolean) => { rememberedReturnToStart = v; setReturnToStartState(v); };

  const apiKey = import.meta.env.VITE_GOOGLEMAPS_API_KEY;

  // Every change goes through here so the order is always Start -> Pick-ups -> Drop-offs -> End.
  const commit = (next: RoutePoint[]) => onPointsChangeRef.current(sortRoutePoints(next));

  // Keep whatever was already in the route (e.g. auto-added customer drop-offs) in the right order.
  useEffect(() => {
    const sorted = sortRoutePoints(pointsRef.current);
    if (sorted.some((p, i) => p !== pointsRef.current[i])) onPointsChangeRef.current(sorted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      next = [...cur, extra?.tag ? { ...pt, tag: extra.tag } : pt];
    }
    onPointsChangeRef.current(sortRoutePoints(next));
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

  // With "Return to start" on (and no different end), the Start point is prefilled as the End point too.
  const startPt = points.find(p => p.tag === 'start');
  const showReturn = returnToStart && !diffEnd && !!startPt && !points.some(p => p.tag === 'end');
  const displayPts = useMemo<RoutePoint[]>(
    () => (showReturn && startPt ? [...points, { ...startPt, id: 'return-to-start', tag: 'end' as const }] : points),
    [points, showReturn, startPt],
  );
  // The stops actually driven (needs at least two real points).
  const routePts = points.length >= 2 ? displayPts : points;

  // Update markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    displayPts.forEach((pt, i) => {
      const color = pt.tag ? tagColors[pt.tag] : '#6b7280';
      const marker = new google.maps.Marker({
        position: { lat: pt.lat, lng: pt.lng },
        map,
        icon: numberedPin(i + 1, color),
        title: pt.id === 'return-to-start' ? `End: ${pt.label} (return to start)` : `${pt.tag ? tagLabels[pt.tag] + ': ' : ''}${pt.label}`,
      });
      markersRef.current.push(marker);
    });

    if (points.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      points.forEach(pt => bounds.extend({ lat: pt.lat, lng: pt.lng }));
      map.fitBounds(bounds, 50);
      if (points.length === 1) map.setZoom(15);
    }
  }, [displayPts, isLoading]);

  // Shortest driving route between each pair of consecutive stops (Routes API),
  // drawn along the roads, with live-traffic durations. Falls back to a dashed straight line.
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
    polylinesRef.current.forEach(p => p.setMap(null));
    polylinesRef.current = [];
    const calcAt = Date.now();
    const legs = routePts.slice(0, -1).map((a, i) => [a, routePts[i + 1]] as const);
    const wp = (p: RoutePoint) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
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
    commit(points.map(p => p.id === id ? { ...p, tag: tag === 'none' ? undefined : tag as any } : p));
  };

  const removePoint = (id: string) => {
    commit(points.filter(p => p.id !== id));
  };

  // ── Drop-off order: drag, use the arrows, or "Plan best route" ──
  const dropoffs = points.filter(p => p.tag === 'dropoff');
  /** Replaces the drop-offs with `next` (in that order). Start, pick-ups and end are untouched and stay before / after. */
  const setDropoffs = (next: RoutePoint[]) => commit([...points.filter(p => p.tag !== 'dropoff'), ...next]);
  const moveDrop = (id: string, dir: -1 | 1) => {
    const i = dropoffs.findIndex(p => p.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= dropoffs.length) return;
    const next = [...dropoffs];
    [next[i], next[j]] = [next[j], next[i]];
    setDropoffs(next);
  };
  const dropOnto = (fromId: string | null, toId: string) => {
    if (!fromId || fromId === toId) return;
    const from = dropoffs.findIndex(p => p.id === fromId);
    const to = dropoffs.findIndex(p => p.id === toId);
    if (from < 0 || to < 0) return;
    const next = [...dropoffs];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setDropoffs(next);
  };

  /** Re-orders the drop-offs for the shortest driving distance: from the last pick-up (or start) to the end point. */
  const planBestRoute = async () => {
    if (dropoffs.length < 2) { toast.info('Add at least two drop-off points to plan the best route'); return; }
    setPlanning(true);
    try {
      const anchor = points.filter(p => p.tag !== 'dropoff' && p.tag !== 'end').slice(-1)[0];
      const terminal = endPt || (showReturn ? startPt : undefined);
      const nodes: RoutePoint[] = [...(anchor ? [anchor] : []), ...dropoffs, ...(terminal ? [terminal] : [])];
      const n = nodes.length;
      const D: number[][] = nodes.map((p, i) => nodes.map((q, j) => (i === j ? 0 : roadGuessM(p, q))));
      let usedRoads = false;

      if (apiKey && n <= 25) {
        try {
          const wpt = (p: RoutePoint) => ({ waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } } });
          const r = await fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': apiKey,
              'X-Goog-FieldMask': 'originIndex,destinationIndex,distanceMeters,condition',
            },
            body: JSON.stringify({ origins: nodes.map(wpt), destinations: nodes.map(wpt), travelMode: 'DRIVE' }),
          });
          if (r.ok) {
            const rows: { originIndex?: number; destinationIndex?: number; distanceMeters?: number; condition?: string }[] = await r.json();
            rows.forEach(e => {
              const o = e.originIndex ?? 0, d = e.destinationIndex ?? 0;
              if (o !== d && typeof e.distanceMeters === 'number' && (!e.condition || e.condition === 'ROUTE_EXISTS')) { D[o][d] = e.distanceMeters; usedRoads = true; }
            });
          }
        } catch { /* fall back to estimated distances */ }
      }

      const order = bestDropOrder(D, !!anchor, !!terminal);
      const a = anchor ? 1 : 0;
      const seq = [...(anchor ? [0] : []), ...order.map(i => a + i), ...(terminal ? [n - 1] : [])];
      const meters = seq.slice(1).reduce((s, v, i) => s + D[seq[i]][v], 0);
      const changed = order.some((v, i) => v !== i);
      if (changed) setDropoffs(order.map(i => dropoffs[i]));
      toast.success(
        `${changed ? 'Drop-offs re-ordered' : 'Drop-offs are already in the best order'} · about ${(meters / 1000).toFixed(1)} km${usedRoads ? '' : ' (estimated, road distances unavailable)'}`,
      );
    } finally {
      setPlanning(false);
    }
  };

  const toggleDiffEnd = (on: boolean) => {
    setDiffEnd(on);
    if (on) {
      setTarget('end');
    } else {
      commit(points.filter(p => p.tag !== 'end'));
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

      {/* Location panel */}
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

        <div className="relative w-full rounded-lg overflow-hidden h-[250px]">
          <div ref={mapRef} className="w-full h-full" />
          {isLoading && <div className="absolute inset-0 flex items-center justify-center bg-background/80 text-muted-foreground text-sm">Loading map...</div>}
          {error && <div className="absolute inset-0 flex items-center justify-center bg-background text-red-500 text-sm">{error}</div>}
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full h-9 text-xs border-pink-500/70 text-pink-400 hover:bg-pink-500/10 hover:text-pink-400"
          onClick={planBestRoute}
          disabled={planning || dropoffs.length < 2}
          title={dropoffs.length < 2 ? 'Add at least two drop-off points' : 'Re-order the drop-offs for the shortest route'}
        >
          {planning ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RouteIcon className="w-3.5 h-3.5 mr-1.5" />}
          Plan best route
        </Button>

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

      {/* Point list (always Start -> Pick-ups -> Drop-offs -> End) */}
      {displayPts.length > 0 && (
        <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
          {displayPts.map((pt, i) => {
            if (pt.id === 'return-to-start') {
              return (
                <div key={pt.id} className="flex items-center gap-2 bg-muted/50 rounded-md px-2 py-1.5 text-xs">
                  <span className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0" style={{ background: tagColors.end }}>{i + 1}</span>
                  <span className="w-[90px] shrink-0 text-[10px] text-muted-foreground">End (return)</span>
                  <span className="flex-1 truncate text-foreground">{pt.label}</span>
                </div>
              );
            }
            const isSupplierPickup = pt.tag === 'pickup' && !!pt.supplierId;
            const picked = isSupplierPickup ? selectedFor(pt.id).length : 0;
            const isDrop = pt.tag === 'dropoff';
            const dropIdx = isDrop ? dropoffs.findIndex(d => d.id === pt.id) : -1;
            return (
              <div
                key={pt.id}
                className="flex items-center gap-2 bg-muted/50 rounded-md px-2 py-1.5 text-xs"
                draggable={isDrop}
                onDragStart={isDrop ? e => { dragId.current = pt.id; e.dataTransfer.effectAllowed = 'move'; } : undefined}
                onDragOver={isDrop ? e => { if (dragId.current && dragId.current !== pt.id) e.preventDefault(); } : undefined}
                onDrop={isDrop ? e => { e.preventDefault(); dropOnto(dragId.current, pt.id); dragId.current = null; } : undefined}
                onDragEnd={() => { dragId.current = null; }}
              >
                {isDrop && dropoffs.length > 1 && <GripVertical className="w-3.5 h-3.5 text-muted-foreground cursor-grab shrink-0 -mr-1" />}
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
                {isDrop && dropoffs.length > 1 && (
                  <div className="flex shrink-0">
                    <button type="button" onClick={() => moveDrop(pt.id, -1)} disabled={dropIdx <= 0} title="Move earlier" className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => moveDrop(pt.id, 1)} disabled={dropIdx >= dropoffs.length - 1} title="Move later" className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                )}
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

      {/* Trip summary */}
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

      {/* Items picked up at a supplier */}
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
