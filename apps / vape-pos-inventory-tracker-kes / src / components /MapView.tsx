import { useEffect, useRef, useState, useCallback } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import { Input } from '@project/components/ui/input';
import { Button } from '@project/components/ui/button';
import { Search } from 'lucide-react';

interface MapPin {
  lat: number;
  lng: number;
  label?: string;
}

interface Props {
  pins?: MapPin[];
  center?: { lat: number; lng: number };
  zoom?: number;
  className?: string;
  onClick?: (lat: number, lng: number) => void;
  selectedPin?: { lat: number; lng: number } | null;
  showSearch?: boolean;
  onSearchSelect?: (lat: number, lng: number, address: string) => void;
}

export default function MapView({ pins = [], center, zoom = 13, className = 'h-[300px]', onClick, selectedPin, showSearch = false, onSearchSelect }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const selectedMarkerRef = useRef<google.maps.Marker | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);

  const apiKey = import.meta.env.VITE_GOOGLEMAPS_API_KEY;
  const defaultCenter = center || { lat: -1.2921, lng: 36.8219 };

  useEffect(() => {
    if (!apiKey) {
      setIsLoading(false);
      setError('Google Maps not connected.');
      return;
    }

    if (mapInstanceRef.current) {
      setIsLoading(false);
      return;
    }

    let mounted = true;
    const loader = new Loader({ apiKey, version: 'weekly' });

    Promise.all([
      loader.importLibrary('maps'),
      loader.importLibrary('geocoding'),
    ]).then(([{ Map }]) => {
      if (!mounted || !mapRef.current || mapInstanceRef.current) return;
      const map = new Map(mapRef.current, { center: defaultCenter, zoom });
      mapInstanceRef.current = map;
      geocoderRef.current = new google.maps.Geocoder();

      if (onClick) {
        map.addListener('click', (e: google.maps.MapMouseEvent) => {
          if (e.latLng) onClick(e.latLng.lat(), e.latLng.lng());
        });
      }

      setIsLoading(false);
    }).catch(() => {
      if (mounted) { setIsLoading(false); setError('Failed to load Google Maps'); }
    });

    return () => { mounted = false; };
  }, [apiKey]);

  // Update markers when pins change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    pins.forEach(pin => {
      const marker = new google.maps.Marker({
        position: { lat: pin.lat, lng: pin.lng },
        map,
        title: pin.label,
      });
      markersRef.current.push(marker);
    });
  }, [pins]);

  // Update selected pin marker and pan to it
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (selectedMarkerRef.current) {
      selectedMarkerRef.current.setMap(null);
      selectedMarkerRef.current = null;
    }
    if (selectedPin) {
      selectedMarkerRef.current = new google.maps.Marker({
        position: selectedPin,
        map,
        icon: { url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png' },
      });
      map.panTo(selectedPin);
      if (map.getZoom()! < 14) map.setZoom(15);
    }
  }, [selectedPin]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || !apiKey) return;
    setSearching(true);
    try {
      // Use REST API for reliable geocoding
      const resp = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(searchQuery)}&key=${apiKey}`);
      const data = await resp.json();
      if (data.results && data.results.length > 0) {
        const loc = data.results[0].geometry.location;
        const lat = loc.lat;
        const lng = loc.lng;
        const addr = data.results[0].formatted_address || searchQuery;

        if (onClick) onClick(lat, lng);
        if (onSearchSelect) onSearchSelect(lat, lng, addr);

        const map = mapInstanceRef.current;
        if (map) {
          map.panTo({ lat, lng });
          map.setZoom(16);
        }
      }
    } catch { /* no results */ }
    setSearching(false);
  }, [searchQuery, onClick, onSearchSelect, apiKey]);

  return (
    <div className="space-y-2">
      {showSearch && (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search location..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="pl-9 h-8 text-xs"
            />
          </div>
          <Button size="sm" variant="outline" onClick={handleSearch} disabled={searching} className="h-8 text-xs">
            {searching ? '...' : 'Search'}
          </Button>
        </div>
      )}
      <div className={`relative w-full rounded-lg overflow-hidden ${className}`}>
        <div ref={mapRef} className="w-full h-full" />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 text-muted-foreground">
            Loading map...
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-background text-red-500 p-4 text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
