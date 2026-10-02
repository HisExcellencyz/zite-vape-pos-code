import { useState, useRef, useEffect, useCallback } from 'react';
import { plainPin } from '../lib/pinIcon';
import { Loader } from '@googlemaps/js-api-loader';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@project/components/ui/dialog';
import { Button } from '@project/components/ui/button';
import { MapPin } from 'lucide-react';
import LocationTabs, { PinStatus } from './LocationTabs';

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
        const map = new Map(mapRef.current, {
          center: { lat: -1.2921, lng: 36.8219 },
          zoom: 12,
          fullscreenControl: true,
          mapTypeControl: false,
          streetViewControl: false,
        });
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
      setSelectedAddress('');
      setSelectedCoords('');
    }
  }, [open]);

  const placePin = useCallback((lat: number, lng: number, address?: string) => {
    // Record the selection first, so it still counts if the map hasn't finished loading.
    setSelectedCoords(`${lat.toFixed(6)},${lng.toFixed(6)}`);
    setSelectedAddress(address || '');

    const map = mapInstanceRef.current;
    if (map) {
      if (markerRef.current) markerRef.current.setMap(null);
      markerRef.current = new google.maps.Marker({
        position: { lat, lng },
        map,
        icon: plainPin('#3b82f6'),
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

  const handleConfirm = () => {
    onSelect(selectedAddress || selectedCoords, selectedCoords);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><MapPin className="w-5 h-5 text-amber-400" />{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {/* Search / Coordinates / Plus code ribbon */}
          <LocationTabs onPick={(lat, lng, address) => placePin(lat, lng, address)} />

          {/* Map */}
          <div className="relative w-full rounded-lg overflow-hidden h-[240px]">
            <div ref={mapRef} className="w-full h-full" />
            {isLoading && <div className="absolute inset-0 flex items-center justify-center bg-background/80 text-muted-foreground text-sm">{apiKey ? 'Loading map...' : 'Google Maps not connected.'}</div>}
          </div>

          <PinStatus
            text={selectedCoords ? (selectedAddress || selectedCoords) : null}
            extra={selectedCoords && selectedAddress ? selectedCoords : null}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!selectedCoords}>Confirm Location</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
