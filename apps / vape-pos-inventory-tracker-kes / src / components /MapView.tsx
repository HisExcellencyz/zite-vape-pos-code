import { useEffect, useRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import { numberedPin, plainPin } from '../lib/pinIcon';

interface MapPin {
  lat: number;
  lng: number;
  label?: string;
  color?: string;
}

interface Props {
  pins?: MapPin[];
  center?: { lat: number; lng: number };
  zoom?: number;
  className?: string;
  onClick?: (lat: number, lng: number) => void;
  selectedPin?: { lat: number; lng: number } | null;
  /** Pan/zoom to this spot whenever a new object is passed in. */
  focus?: { lat: number; lng: number } | null;
  /** Zoom/pan so every pin is visible at once. */
  fitToPins?: boolean;
  /** Use plain pins with a dark dot instead of numbered pins. */
  plainPins?: boolean;
  /** Small embedded maps (inside dialogs) show only the fullscreen button. */
  compact?: boolean;
  /** When set, every pin (and the selected pin) uses this colour instead of its own. */
  pinColor?: string;
  /** Size of the pins, 1 = full size, 0.7 = 70%. */
  pinScale?: number;
}

/**
 * A map with pins. Searching by place / Plus Code / coordinates is done by the
 * LocationTabs ribbon placed above it, so this component only draws the map.
 */
export default function MapView({
  pins = [], center, zoom = 13, className = 'h-[300px]', onClick, selectedPin,
  focus = null, fitToPins = false, plainPins = false, compact = false,
  pinColor, pinScale = 1,
}: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const selectedMarkerRef = useRef<google.maps.Marker | null>(null);
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();

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
    const loader = new Loader({ apiKey, version: 'weekly', libraries: ['places'] });

    loader.importLibrary('maps').then(({ Map }) => {
      if (!mounted || !mapRef.current || mapInstanceRef.current) return;
      const map = new Map(mapRef.current, {
        center: defaultCenter,
        zoom,
        fullscreenControl: true,
        mapTypeControl: !compact,   // Map / Satellite switch
        streetViewControl: !compact,
      });
      mapInstanceRef.current = map;

      map.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (e.latLng) onClickRef.current?.(e.latLng.lat(), e.latLng.lng());
      });

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
    pins.forEach((pin, i) => {
      const color = pinColor || pin.color || '#ef4444';
      const marker = new google.maps.Marker({
        position: { lat: pin.lat, lng: pin.lng },
        map,
        title: pin.label,
        icon: plainPins ? plainPin(color, pinScale) : numberedPin(i + 1, color, pinScale),
      });
      markersRef.current.push(marker);
    });
    if (fitToPins && pins.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      pins.forEach(p => bounds.extend({ lat: p.lat, lng: p.lng }));
      map.fitBounds(bounds, 40);
      if (pins.length === 1) map.setZoom(15);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(pins), isLoading, plainPins, pinColor, pinScale]);

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
        icon: plainPin(pinColor || '#3b82f6', pinScale),
      });
      map.panTo(selectedPin);
      if (map.getZoom()! < 14) map.setZoom(15);
    }
  }, [selectedPin, isLoading, pinColor, pinScale]);

  // Jump to a spot (e.g. when an address tile is clicked)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !focus) return;
    map.panTo(focus);
    if ((map.getZoom() || 0) < 16) map.setZoom(16);
  }, [focus, isLoading]);

  return (
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
  );
}
