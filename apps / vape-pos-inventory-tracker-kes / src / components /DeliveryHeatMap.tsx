import { useEffect, useRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import { plainPin } from '../lib/pinIcon';

export interface HeatPoint {
  key: string;
  lat: number;
  lng: number;
  label: string;
  orders: number;
  revenue: number;
}
export type HeatMetric = 'orders' | 'revenue';

interface Props {
  points: HeatPoint[];
  metric: HeatMetric;
  focus?: { lat: number; lng: number } | null;
  onSelect?: (key: string) => void;
  className?: string;
}

// Busiest areas are blue, fading gently through green and gold to pink at the lightest.
const RAMP: [number, string][] = [
  [0, '#ec4899'],
  [0.35, '#f5b301'],
  [0.68, '#22c55e'],
  [1, '#3b82f6'],
];

function buildLut() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 1;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 256, 0);
  RAMP.forEach(([o, col]) => g.addColorStop(o, col));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 1);
  return ctx.getImageData(0, 0, 256, 1).data;
}

type HeatData = { pts: { lat: number; lng: number; w: number }[] };

// Google's own HeatmapLayer is deprecated, so the heat map is drawn on a canvas overlay instead.
function createOverlay(dataRef: { current: HeatData }, lut: Uint8ClampedArray) {
  class Heat extends google.maps.OverlayView {
    canvas = document.createElement('canvas');
    onAdd() {
      this.canvas.style.position = 'absolute';
      this.canvas.style.pointerEvents = 'none';
      this.getPanes()!.overlayLayer.appendChild(this.canvas);
    }
    onRemove() {
      this.canvas.parentNode?.removeChild(this.canvas);
    }
    draw() {
      const proj = this.getProjection();
      const map = this.getMap() as google.maps.Map | null;
      if (!proj || !map) return;
      const div = map.getDiv();
      const w = div.clientWidth, h = div.clientHeight;
      const b = map.getBounds();
      if (!w || !h || !b) return;
      const ne = b.getNorthEast(), sw = b.getSouthWest();
      const topLeft = proj.fromLatLngToDivPixel(new google.maps.LatLng(ne.lat(), sw.lng()));
      if (!topLeft) return;
      const c = this.canvas;
      c.style.left = `${topLeft.x}px`;
      c.style.top = `${topLeft.y}px`;
      if (c.width !== w) c.width = w;
      if (c.height !== h) c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.clearRect(0, 0, w, h);
      const pts = dataRef.current.pts;
      if (!pts.length) return;
      const r = Math.max(32, Math.min(90, (map.getZoom() || 12) * 4));
      for (const p of pts) {
        const px = proj.fromLatLngToContainerPixel(new google.maps.LatLng(p.lat, p.lng));
        if (!px || px.x < -r || px.y < -r || px.x > w + r || px.y > h + r) continue;
        const a = 0.3 + 0.7 * Math.sqrt(p.w);
        const g = ctx.createRadialGradient(px.x, px.y, 0, px.x, px.y, r);
        g.addColorStop(0, `rgba(0,0,0,${a})`);
        g.addColorStop(0.5, `rgba(0,0,0,${a * 0.45})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(px.x - r, px.y - r, r * 2, r * 2);
      }
      const img = ctx.getImageData(0, 0, w, h);
      const d = img.data;
      for (let i = 3; i < d.length; i += 4) {
        const al = d[i];
        if (!al) continue;
        const li = al * 4;
        d[i - 3] = lut[li]; d[i - 2] = lut[li + 1]; d[i - 1] = lut[li + 2];
        d[i] = al < 6 ? 0 : Math.min(200, 70 + al * 0.7);
      }
      ctx.putImageData(img, 0, 0);
    }
  }
  return new Heat();
}

export default function DeliveryHeatMap({ points, metric, focus = null, onSelect, className = 'h-[420px]' }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<google.maps.Map | null>(null);
  const overlayRef = useRef<google.maps.OverlayView | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const dataRef = useRef<HeatData>({ pts: [] });
  const lastSig = useRef('');
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();

  const apiKey = import.meta.env.VITE_GOOGLEMAPS_API_KEY;

  useEffect(() => {
    if (!apiKey) { setError('Google Maps not connected.'); return; }
    let mounted = true;
    const loader = new Loader({ apiKey, version: 'weekly', libraries: ['places'] });
    loader.importLibrary('maps').then(({ Map }) => {
      if (!mounted || !mapRef.current || mapObj.current) return;
      const map = new Map(mapRef.current, {
        center: { lat: -1.2921, lng: 36.8219 },
        zoom: 11,
        fullscreenControl: true,
        mapTypeControl: false,
        streetViewControl: false,
      });
      mapObj.current = map;
      const overlay = createOverlay(dataRef, buildLut());
      overlay.setMap(map);
      overlayRef.current = overlay;
      map.addListener('idle', () => (overlay as any).draw());
      setReady(true);
    }).catch(() => { if (mounted) setError('Failed to load Google Maps'); });
    return () => {
      mounted = false;
      overlayRef.current?.setMap(null);
      markersRef.current.forEach(m => m.setMap(null));
    };
  }, [apiKey]);

  useEffect(() => {
    const map = mapObj.current;
    if (!map || !ready) return;

    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = points.map(p => {
      const m = new google.maps.Marker({
        position: { lat: p.lat, lng: p.lng },
        map,
        title: `${p.label} — ${p.orders} order${p.orders === 1 ? '' : 's'}, KES ${Math.round(p.revenue).toLocaleString()}`,
        // Red pins at 70% of the standard size
        icon: plainPin('#ef4444', 0.7),
      });
      m.addListener('click', () => onSelectRef.current?.(p.key));
      return m;
    });

    const values = points.map(p => (metric === 'orders' ? p.orders : p.revenue));
    const max = Math.max(...values, 0) || 1;
    dataRef.current = { pts: points.map((p, i) => ({ lat: p.lat, lng: p.lng, w: Math.max(0.05, values[i] / max) })) };

    const sig = points.map(p => p.key).join('|');
    if (sig !== lastSig.current) {
      lastSig.current = sig;
      if (points.length > 0) {
        const bounds = new google.maps.LatLngBounds();
        points.forEach(p => bounds.extend({ lat: p.lat, lng: p.lng }));
        map.fitBounds(bounds, 60);
        if (points.length === 1) map.setZoom(15);
      }
    }
    (overlayRef.current as any)?.draw();
  }, [points, metric, ready]);

  useEffect(() => {
    const map = mapObj.current;
    if (!map || !focus) return;
    map.panTo(focus);
    if ((map.getZoom() || 0) < 15) map.setZoom(15);
  }, [focus, ready]);

  return (
    <div className={`relative w-full rounded-lg overflow-hidden ${className}`}>
      <div ref={mapRef} className="w-full h-full" />
      {!ready && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 text-muted-foreground text-sm">Loading map...</div>
      )}
      {error && <div className="absolute inset-0 flex items-center justify-center bg-background text-red-500 p-4 text-sm">{error}</div>}
      {ready && (
        <div className="absolute left-2 bottom-6 z-10 rounded-md bg-background/90 border border-border px-2 py-1.5 shadow">
          <div className="h-2 w-40 rounded-full" style={{ background: 'linear-gradient(to right,#3b82f6,#22c55e,#f5b301,#ec4899)' }} />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
            <span>Busiest</span><span>Lightest</span>
          </div>
          <p className="text-[10px] text-muted-foreground">By {metric === 'orders' ? 'number of orders' : 'revenue (KES)'}</p>
        </div>
      )}
    </div>
  );
}
