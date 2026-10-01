import { useState, useRef, useEffect, useCallback } from 'react';
import { numberedPin } from '../lib/pinIcon';
import { Loader } from '@googlemaps/js-api-loader';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@project/components/ui/dialog';
import { Input } from '@project/components/ui/input';
import { Button } from '@project/components/ui/button';
import { MapPin } from 'lucide-react';
import LocationSearchBox from './LocationSearchBox';

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
  const [coordsInput, setCoordsInput] = useState('');
  const [selectedAddress, setSelectedAddress] = useState('');
  const [selectedCoords, setSelectedCoords] = useState('');

  const apiKey = import.meta.env.VITE_GOOGLEMAPS_API_KEY;

  useEffect(() => {
    if (!open || !apiKey || mapInstanceRef.current) return;

    const timer = setTimeout(() => {
      if (!mapRef.current) return;
      const loader = new Loader({ apiKey, version: 'weekly', libraries: ['places'] });
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
      setCoordsInput('');
      setSelectedAddress('');
      setSelectedCoords('');
    }
  }, [open]);

  const placePin = useCallback((lat: number, lng: number, address?: string) => {
    // Record the selection first, so it still counts if the map hasn't finished loading.
    setSelectedCoords(`${lat.toFixed(6)},${lng.toFixed(6)}`);
    if (address) setSelectedAddress(address);

    const map = mapInstanceRef.current;
    if (map) {
      if (markerRef.current) markerRef.current.setMap(null);
      markerRef.current = new google.maps.Marker({
        position: { lat, lng },
        map,
        icon: numberedPin(1, '#3b82f6'),
      });
      map.panTo({ lat, lng });
      if (map.getZoom()! < 14) map.setZoom(15);
    }

    // Reverse geocode (map clicks / typed coordinates) to get an address
    if (!address && geocoderRef.current) {
      geocoderRef.current.geocode({ location: { lat, lng } }).then(res => {
        if (res.results?.[0]) setSelectedAddress(res.results[0].formatted_address);
      }).catch(() => {});
    }
  }, []);

  const handleCoordsAdd = () => {
    const parts = coordsInput.split(',').map(s => s.trim());
    if (parts.length === 2) {
      const lat = parseFloat(parts[0]), lng = parseFloat(parts[1]);
      if (isFinite(lat) && isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        placePin(lat, lng);
        setCoordsInput('');
      }
    }
  };

  const handleConfirm = () => {
    onSelect(selectedAddress || selectedCoords, selectedCoords);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><MapPin className="w-5 h-5 text-primary" />{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {/* Google Maps place search + Plus Code */}
          <LocationSearchBox onPick={(lat, lng, address) => placePin(lat, lng, address)} />

          {/* Coordinates */}
          <div className="flex gap-2">
            <Input placeholder="Coordinates (lat,lng)" value={coordsInput} onChange={e => setCoordsInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCoordsAdd()} className="flex-1 h-8 text-xs" />
            <Button type="button" size="sm" variant="outline" onClick={handleCoordsAdd} className="h-8 text-xs"><MapPin className="w-3 h-3 mr-1" />Pin</Button>
          </div>

          {/* Map */}
          <div className="relative w-full rounded-lg overflow-hidden h-[220px]">
            <div ref={mapRef} className="w-full h-full" />
            {isLoading && <div className="absolute inset-0 flex items-center justify-center bg-background/80 text-muted-foreground text-sm">{apiKey ? 'Loading map...' : 'Google Maps not connected.'}</div>}
          </div>
          <p className="text-[10px] text-muted-foreground">Or click anywhere on the map to drop a pin.</p>

          {/* Selected */}
          {selectedCoords && (
            <div className="bg-muted/50 rounded-md px-3 py-2 text-xs space-y-0.5">
              {selectedAddress && <p className="text-foreground font-medium break-words">{selectedAddress}</p>}
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
