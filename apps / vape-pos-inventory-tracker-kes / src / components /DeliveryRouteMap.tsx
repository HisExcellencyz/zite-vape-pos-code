import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import { getAddresses } from 'zitejs/api';
import { Input } from '@project/components/ui/input';
import { Button } from '@project/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Label } from '@project/components/ui/label';
import { Trash2, MapPin, BookMarked, Loader2 } from 'lucide-react';
import LocationSearchBox from './LocationSearchBox';
import { geocode } from '../lib/geocode';
import { numberedPin } from '../lib/pinIcon';

export interface RoutePoint {
  id: string;
  label: string;
  tag?: 'start' | 'pickup' | 'dropoff' | 'end';
  lat: number;
  lng: number;
}

interface Props {
  points: RoutePoint[];
  onPointsChange: (points: RoutePoint[]) => void;
  totalDistance: number;
  onDistanceChange: (km: number) => void;
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

interface SavedAddr { id: string; addressName?: string; type?: string; coordinates?: string; fullAddress?: string; }

export default function DeliveryRouteMap({ points, onPointsChange, totalDistance, onDistanceChange }: Props) {
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
  const [coordsInput, setCoordsInput] = useState('');
  const [savedAddresses, setSavedAddresses] = useState<SavedAddr[]>([]);
  const [distanceMode, setDistanceMode] = useState<DistanceMode | null>(null);
  const [calculatingDistance, setCalculatingDistance] = useState(false);

  const apiKey = import.meta.env.VITE_GOOGLEMAPS_API_KEY;

  const addPoint = useCallback((lat: number, lng: number, label?: string) => {
    const pt: RoutePoint = { id: genId(), label: label || `${lat.toFixed(5)},${lng.toFixed(5)}`, lat, lng };
    onPointsChangeRef.current([...pointsRef.current, pt]);
  }, []);

  // Load saved addresses
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
      const map = new Map(mapRef.current, { center: { lat: -1.2921, lng: 36.8219 }, zoom: 12 });
      mapInstanceRef.current = map;

      map.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (e.latLng) addPoint(e.latLng.lat(), e.latLng.lng());
      });

      setIsLoading(false);
    }).catch(() => { if (mounted) { setIsLoading(false); setError('Failed to load Google Maps'); } });

    return () => { mounted = false; };
  }, [apiKey]);

  // Update markers and polylines
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    polylinesRef.current.forEach(p => p.setMap(null));
    polylinesRef.current = [];

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
  }, [points]);

  // Shortest driving route between each pair of consecutive stops (Directions API),
  // drawn along the roads. Falls back to a dashed straight line if no route is found.
  useEffect(() => {
    const map = mapInstanceRef.current;
    let cancelled = false;
    if (points.length < 2) { setDistanceMode(null); onDistanceChange(0); return; }
    if (!map) return;
    setCalculatingDistance(true);
    const legs = points.slice(0, -1).map((a, i) => [a, points[i + 1]] as const);
    const wp = (p: RoutePoint) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
    Promise.all(legs.map(([a, b]) =>
      fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'routes.distanceMeters,routes.polyline.encodedPolyline',
        },
        body: JSON.stringify({ origin: wp(a), destination: wp(b), travelMode: 'DRIVE', computeAlternativeRoutes: true }),
      }).then(async r => {
        if (!r.ok) { console.error('Routes API error', r.status, await r.text()); return null; }
        const data: { routes?: { distanceMeters?: number; polyline?: { encodedPolyline?: string } }[] } = await r.json();
        const best = (data.routes || []).filter(x => typeof x.distanceMeters === 'number' && x.polyline?.encodedPolyline)
          .sort((x, y) => x.distanceMeters! - y.distanceMeters!)[0];
        return best ? { meters: best.distanceMeters!, path: decodePolyline(best.polyline!.encodedPolyline!), road: true } : null;
      }).catch(() => null).then(r => r || {
        meters: haversineM(a, b), path: [new google.maps.LatLng(a.lat, a.lng), new google.maps.LatLng(b.lat, b.lng)], road: false,
      })
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
    }).finally(() => { if (!cancelled) setCalculatingDistance(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, isLoading]);

  const handleCoordsAdd = () => {
    const parts = coordsInput.split(',').map(s => s.trim());
    if (parts.length === 2) {
      const lat = parseFloat(parts[0]), lng = parseFloat(parts[1]);
      if (isFinite(lat) && isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        addPoint(lat, lng);
        setCoordsInput('');
      }
    }
  };

  const handleSavedAddress = async (addrId: string) => {
    const addr = savedAddresses.find(a => a.id === addrId);
    if (!addr) return;
    if (addr.coordinates) {
      const parts = addr.coordinates.split(',').map(s => s.trim());
      if (parts.length === 2) {
        const lat = parseFloat(parts[0]), lng = parseFloat(parts[1]);
        if (isFinite(lat) && isFinite(lng)) {
          addPoint(lat, lng, addr.addressName || addr.fullAddress || addr.coordinates);
          return;
        }
      }
    }
    // No coordinates saved: look the address up on Google Maps
    const text = addr.fullAddress || addr.addressName || '';
    if (text) {
      const out = await geocode(text);
      const r = out.results[0];
      if (r) addPoint(r.lat, r.lng, addr.addressName || addr.fullAddress || r.address);
    }
  };

  const updateTag = (id: string, tag: string) => {
    onPointsChange(points.map(p => p.id === id ? { ...p, tag: tag === 'none' ? undefined : tag as any } : p));
  };

  const removePoint = (id: string) => {
    onPointsChange(points.filter(p => p.id !== id));
  };

  return (
    <div className="space-y-3">
      {/* Saved addresses quick-add */}
      {savedAddresses.length > 0 && (
        <div>
          <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><BookMarked className="w-3 h-3" /> Saved Addresses</Label>
          <Select onValueChange={handleSavedAddress}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Add from saved addresses..." /></SelectTrigger>
            <SelectContent>
              {savedAddresses.map(a => (
                <SelectItem key={a.id} value={a.id}>{a.addressName} {a.type ? `(${a.type})` : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Google Maps place search + Plus Code */}
      <LocationSearchBox onPick={(lat, lng, address) => addPoint(lat, lng, address)} />

      {/* Add via coords */}
      <div className="flex gap-2">
        <Input placeholder="Coordinates (lat,lng)" value={coordsInput} onChange={e => setCoordsInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCoordsAdd()} className="flex-1 h-8 text-xs" />
        <Button size="sm" variant="outline" onClick={handleCoordsAdd} className="h-8 text-xs"><MapPin className="w-3 h-3 mr-1" />Add</Button>
      </div>

      {/* Map */}
      <div className="relative w-full rounded-lg overflow-hidden h-[250px]">
        <div ref={mapRef} className="w-full h-full" />
        {isLoading && <div className="absolute inset-0 flex items-center justify-center bg-background/80 text-muted-foreground text-sm">Loading map...</div>}
        {error && <div className="absolute inset-0 flex items-center justify-center bg-background text-red-500 text-sm">{error}</div>}
        <div className="absolute bottom-0 left-0 right-0 bg-background/80 backdrop-blur-sm text-xs p-1 text-center text-muted-foreground">
          Click on map to add a pin
        </div>
      </div>

      {/* Point list */}
      {points.length > 0 && (
        <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
          {points.map((pt, i) => (
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
              <button onClick={() => removePoint(pt.id)} className="text-destructive hover:text-red-300">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Total distance */}
      {points.length >= 2 && (
        <div className="rounded-md bg-primary/10 px-3 py-2 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">Total Distance</span>
            <span className="text-sm font-bold text-primary flex items-center gap-1.5">
              {calculatingDistance && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {totalDistance.toFixed(2)} km
            </span>
          </div>
          {distanceMode && !calculatingDistance && (
            <p className="text-[10px] text-muted-foreground text-right">
              {distanceModeLabels[distanceMode]}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
