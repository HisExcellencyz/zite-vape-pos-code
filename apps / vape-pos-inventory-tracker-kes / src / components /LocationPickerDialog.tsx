import { useState, useRef, useEffect, useCallback } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@project/components/ui/dialog';
import { Input } from '@project/components/ui/input';
import { Button } from '@project/components/ui/button';
import { Label } from '@project/components/ui/label';
import { Search, MapPin, Navigation } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  value?: string;
  onSelect: (address: string, coords: string) => void;
}

export default function LocationPickerDialog({ open, onOpenChange, title = 'Set Location', value, onSelect }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [coordsInput, setCoordsInput] = useState('');
  const [plusCodeInput, setPlusCodeInput] = useState('');
  const [selectedAddress, setSelectedAddress] = useState('');
  const [selectedCoords, setSelectedCoords] = useState('');

  const apiKey = import.meta.env.VITE_GOOGLEMAPS_API_KEY;

  useEffect(() => {
    if (!open || !apiKey || mapInstanceRef.current) return;

    const timer = setTimeout(() => {
      if (!mapRef.current) return;
      const loader = new Loader({ apiKey, version: 'weekly' });
      Promise.all([
        loader.importLibrary('maps'),
        loader.importLibrary('geocoding'),
      ]).then(([{ Map }]) => {
        if (!mapRef.current || mapInstanceRef.current) return;
        const map = new Map(mapRef.current, { center: { lat: -1.2921, lng: 36.8219 }, zoom: 12 });
        mapInstanceRef.current = map;
        geocoderRef.current = new google.maps.Geocoder();
        map.addListener('click', (e: google.maps.MapMouseEvent) => {
          if (e.latLng) placePin(e.latLng.lat(), e.latLng.lng());
        });
        setIsLoading(false);
      }).catch(() => setIsLoading(false));
    }, 100);

    return () => clearTimeout(timer);
  }, [open, apiKey]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      mapInstanceRef.current = null;
      markerRef.current = null;
      geocoderRef.current = null;
      setIsLoading(true);
      setSearchQuery('');
      setCoordsInput('');
      setPlusCodeInput('');
      setSelectedAddress('');
      setSelectedCoords('');
    }
  }, [open]);

  const placePin = useCallback((lat: number, lng: number, address?: string) => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (markerRef.current) markerRef.current.setMap(null);
    markerRef.current = new google.maps.Marker({
      position: { lat, lng },
      map,
      icon: { url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png' },
    });
    map.panTo({ lat, lng });
    if (map.getZoom()! < 14) map.setZoom(15);
    setSelectedCoords(`${lat.toFixed(6)},${lng.toFixed(6)}`);
    if (address) setSelectedAddress(address);

    // Reverse geocode if no address
    if (!address && geocoderRef.current) {
      geocoderRef.current.geocode({ location: { lat, lng } }).then(res => {
        if (res.results?.[0]) setSelectedAddress(res.results[0].formatted_address);
      }).catch(() => {});
    }
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim() || !apiKey) return;
    setSearching(true);
    try {
      const resp = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(searchQuery)}&key=${apiKey}`);
      const data = await resp.json();
      if (data.results?.[0]) {
        const loc = data.results[0].geometry.location;
        placePin(loc.lat, loc.lng, data.results[0].formatted_address);
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
        placePin(lat, lng);
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
        placePin(lat, lng, data.results[0].formatted_address || plusCodeInput);
        setPlusCodeInput('');
      }
    } catch {}
  };

  const handleConfirm = () => {
    onSelect(selectedAddress || selectedCoords, selectedCoords);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><MapPin className="w-5 h-5 text-primary" />{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {/* Search */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input placeholder="Search location..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} className="pl-8 h-8 text-xs" />
            </div>
            <Button size="sm" variant="outline" onClick={handleSearch} disabled={searching} className="h-8 text-xs">{searching ? '...' : 'Search'}</Button>
          </div>
          {/* Coords */}
          <div className="flex gap-2">
            <Input placeholder="Coordinates (lat,lng)" value={coordsInput} onChange={e => setCoordsInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCoordsAdd()} className="flex-1 h-8 text-xs" />
            <Button size="sm" variant="outline" onClick={handleCoordsAdd} className="h-8 text-xs"><MapPin className="w-3 h-3 mr-1" />Pin</Button>
          </div>
          {/* Plus code */}
          <div className="flex gap-2">
            <Input placeholder="Plus Code (e.g. 6GCRMQFG+R8)" value={plusCodeInput} onChange={e => setPlusCodeInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handlePlusCodeAdd()} className="flex-1 h-8 text-xs" />
            <Button size="sm" variant="outline" onClick={handlePlusCodeAdd} className="h-8 text-xs"><Navigation className="w-3 h-3 mr-1" />Pin</Button>
          </div>
          {/* Map */}
          <div className="relative w-full rounded-lg overflow-hidden h-[220px]">
            <div ref={mapRef} className="w-full h-full" />
            {isLoading && <div className="absolute inset-0 flex items-center justify-center bg-background/80 text-muted-foreground text-sm">Loading map...</div>}
          </div>
          {/* Selected */}
          {selectedCoords && (
            <div className="bg-muted/50 rounded-md px-3 py-2 text-xs space-y-0.5">
              {selectedAddress && <p className="text-foreground font-medium">{selectedAddress}</p>}
              <p className="text-muted-foreground font-mono">{selectedCoords}</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!selectedCoords}>Confirm Location</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
