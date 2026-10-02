import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { Input } from '@project/components/ui/input';
import { Button } from '@project/components/ui/button';
import { cn } from '@project/components/lib/utils';
import LocationSearchBox from './LocationSearchBox';
import { parseCoordinates } from '../lib/geocode';

type Tab = 'search' | 'coordinates' | 'plus';

const TABS: { key: Tab; label: string }[] = [
  { key: 'search', label: 'Search' },
  { key: 'coordinates', label: 'Coordinates' },
  { key: 'plus', label: 'Plus code' },
];

interface Props {
  /**
   * Called when a location is chosen. `address` is empty when the location came
   * from typed coordinates (the caller can reverse-geocode if it needs one).
   */
  onPick: (lat: number, lng: number, address?: string, plusCode?: string) => void;
  className?: string;
}

/**
 * The top ribbon used by every location dialog: pick Search, Coordinates or
 * Plus code, and the matching input appears underneath.
 */
export default function LocationTabs({ onPick, className = '' }: Props) {
  const [tab, setTab] = useState<Tab>('search');
  const [coords, setCoords] = useState('');
  const [coordsError, setCoordsError] = useState('');

  const submitCoords = () => {
    const parsed = parseCoordinates(coords);
    if (!parsed) {
      setCoordsError('Enter coordinates as latitude,longitude — e.g. -1.2921,36.8219');
      return;
    }
    setCoordsError('');
    setCoords('');
    onPick(parsed.lat, parsed.lng);
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            aria-pressed={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'h-8 rounded-md text-xs font-medium transition-colors',
              tab === t.key ? 'bg-background text-foreground shadow' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'search' && <LocationSearchBox showSearch showPlusCode={false} onPick={onPick} />}
      {tab === 'plus' && <LocationSearchBox showSearch={false} showPlusCode onPick={onPick} />}
      {tab === 'coordinates' && (
        <div className="space-y-1">
          <div className="flex gap-2">
            <Input
              placeholder="Latitude, longitude  e.g. -1.2921,36.8219"
              value={coords}
              onChange={e => { setCoords(e.target.value); setCoordsError(''); }}
              onKeyDown={e => e.key === 'Enter' && submitCoords()}
              className="h-9"
              autoComplete="off"
            />
            <Button type="button" size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={submitCoords} aria-label="Drop pin" title="Drop pin">
              <MapPin className="w-4 h-4" />
            </Button>
          </div>
          {coordsError && <p className="text-xs text-destructive">{coordsError}</p>}
          <p className="text-[10px] text-muted-foreground">Paste coordinates copied from Google Maps (latitude, then longitude).</p>
        </div>
      )}
    </div>
  );
}

/** One-line status under a location map, e.g. "No pin yet — search, or click the map". */
export function PinStatus({ text, extra }: { text?: string | null; extra?: string | null }) {
  return (
    <div className="space-y-0.5">
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-pink-400" />
        <span className="break-words min-w-0">{text || 'No pin yet — search, or click the map'}</span>
      </p>
      {extra && <p className="pl-5 text-[10px] font-mono text-muted-foreground">{extra}</p>}
    </div>
  );
}
