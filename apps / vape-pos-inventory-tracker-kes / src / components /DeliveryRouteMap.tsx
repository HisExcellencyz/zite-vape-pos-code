import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import { getAddresses } from 'zitejs/api';
import { Input } from '@project/components/ui/input';
import { Button } from '@project/components/ui/button';
import { Badge } from '@project/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Label } from '@project/components/ui/label';
import { Search, Trash2, MapPin, Navigation, BookMarked } from 'lucide-react';

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

let nextId = 1;
function genId() { return `rp_${nextId++}_${Date.now()}`; }

interface SavedAddr { id: string; addressName?: string; type?: string; coordinates?: string; fullAddress?: string; }

export default function DeliveryRouteMap({ points, onPointsChange, totalDistance, onDistanceChange }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [coordsInput, setCoordsInput] = useState('');
  const [plusCodeInput, setPlusCodeInput] = useState('');
  const [savedAddresses, setSavedAddresses] = useState<SavedAddr[]>([]);

  const apiKey = import.meta.env.VITE_GOOGLEMAPS_API_KEY;

  // Load saved addresses
  useEffect(() => {
    getAddresses({}).then(res => setSavedAddresses(res.addresses as SavedAddr[])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!apiKey) { setIsLoading(false); setError('Google Maps not connected.'); return; }
    if (mapInstanceRef.current) { setIsLoading(false); return; }

    let mounted = true;
    const loader = new Loader({ apiKey, version: 'weekly' });

    Promise.all([
      loader.importLibrary('maps'),
      loader.importLibrary('geocoding'),
    ]).then(([{ Map }]) => {
      if (!mounted || !mapRef.current || mapInstanceRef.current) return;
      const map = new Map(mapRef.current, { center: { lat: -1.2921, lng: 36.8219 }, zoom: 12 });
      mapInstanceRef.current = map;
      geocoderRef.current = new google.maps.Geocoder();

      map.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (e.latLng) addPoint(e.latLng.lat(), e.latLng.lng());
      });

      setIsLoading(false);
    }).catch(() => { if (mounted) { setIsLoading(false); setError('Failed to load Google Maps'); } });

    return () => { mounted = false; };
  }, [apiKey]);

  const addPoint = useCallback((lat: number, lng: number, label?: string) => {
    const pt: RoutePoint = { id: genId(), label: label || `${lat.toFixed(5)},${lng.toFixed(5)}`, lat, lng };
    onPointsChange([...points, pt]);
  }, [points, onPointsChange]);

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
        label: { text: `${i + 1}`, color: 'white', fontWeight: 'bold', fontSize: '11px' },
        icon: {
          path: google.maps.SymbolPath.CIRCLE, scale: 14,
          fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2,
        },
        title: `${pt.tag ? tagLabels[pt.tag] + ': ' : ''}${pt.label}`,
      });
      markersRef.current.push(marker);
    });

    if (points.length >= 2) {
      const path = points.map(pt => ({ lat: pt.lat, lng: pt.lng }));
      const polyline = new google.maps.Polyline({
        path, geodesic: false, strokeColor: '#3b82f6', strokeOpacity: 0.8, strokeWeight: 3, map,
      });
      polylinesRef.current.push(polyline);

      let totalDist = 0;
      for (let i = 0; i < path.length - 1; i++) {
        totalDist += haversine(path[i].lat, path[i].lng, path[i + 1].lat, path[i + 1].lng);
      }
      onDistanceChange(Math.round(totalDist * 100) / 100);
    } else {
      onDistanceChange(0);
    }

    if (points.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      points.forEach(pt => bounds.extend({ lat: pt.lat, lng: pt.lng }));
      map.fitBounds(bounds, 50);
      if (points.length === 1) map.setZoom(15);
    }
  }, [points]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    // Use the REST API as fallback for geocoding (more reliable than the JS Geocoder which may not init in time)
    setSearching(true);
    try {
      const resp = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(searchQuery)}&key=${apiKey}`);
      const data = await resp.json();
      if (data.results?.[0]?.geometry?.location) {
        const { lat, lng } = data.results[0].geometry.location;
        addPoint(lat, lng, data.results[0].formatted_address || searchQuery);
        setSearchQuery('');
      }
    } catch {}
    setSearching(false);
  };

  const handleCoordsAdd = () => {
    const parts = coordsInput.split(',').map(s => s.trim());
    if (parts.length === 2) {
      const lat = parseFloat(parts[0]), lng = parseFloat(parts[1]);
      if (isFinite(lat) && isFinite(lng) && lat >= -90 && lat <= 90) {
        addPoint(lat, lng);
        setCoordsInput('');
      }
    }
  };

  const handlePlusCodeAdd = async () => {
    if (!plusCodeInput.trim() || !apiKey) return;
    try {
      const resp = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(plusCodeInput)}&key=${apiKey}`);
      const data = await resp.json();
      if (data.results?.[0]?.geometry?.location) {
        const { lat, lng } = data.results[0].geometry.location;
        addPoint(lat, lng, data.results[0].formatted_address || plusCodeInput);
        setPlusCodeInput('');
      }
    } catch {}
  };

  const handleSavedAddress = (addrId: string) => {
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
    // Geocode the address name
    if (addr.fullAddress || addr.addressName) {
      fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addr.fullAddress || addr.addressName || '')}&key=${apiKey}`)
        .then(r => r.json())
        .then(data => {
          if (data.results?.[0]?.geometry?.location) {
            const { lat, lng } = data.results[0].geometry.location;
            addPoint(lat, lng, addr.addressName || addr.fullAddress || '');
          }
        }).catch(() => {});
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

      {/* Add via search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="Search location..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} className="pl-8 h-8 text-xs" />
        </div>
        <Button size="sm" variant="outline" onClick={handleSearch} disabled={searching} className="h-8 text-xs">{searching ? '...' : 'Search'}</Button>
      </div>

      {/* Add via coords */}
      <div className="flex gap-2">
        <Input placeholder="Coordinates (lat,lng)" value={coordsInput} onChange={e => setCoordsInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCoordsAdd()} className="flex-1 h-8 text-xs" />
        <Button size="sm" variant="outline" onClick={handleCoordsAdd} className="h-8 text-xs"><MapPin className="w-3 h-3 mr-1" />Add</Button>
      </div>

      {/* Add via plus code */}
      <div className="flex gap-2">
        <Input placeholder="Plus Code (e.g. 6GCRMQFG+R8)" value={plusCodeInput} onChange={e => setPlusCodeInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handlePlusCodeAdd()} className="flex-1 h-8 text-xs" />
        <Button size="sm" variant="outline" onClick={handlePlusCodeAdd} className="h-8 text-xs"><Navigation className="w-3 h-3 mr-1" />Add</Button>
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
        <div className="flex items-center justify-between bg-primary/10 rounded-md px-3 py-2">
          <span className="text-xs font-medium text-foreground">Total Distance</span>
          <span className="text-sm font-bold text-primary">{totalDistance.toFixed(2)} km</span>
        </div>
      )}
    </div>
  );
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
