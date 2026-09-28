import { useState } from 'react';
import { Input } from '@project/components/ui/input';
import { Button } from '@project/components/ui/button';
import { Search, Navigation, MapPin } from 'lucide-react';
import { geocode, GeoResult } from '../lib/geocode';

interface Props {
  /** Called when a Google Maps result is chosen. */
  onPick: (lat: number, lng: number, address: string, plusCode?: string) => void;
  showSearch?: boolean;
  showPlusCode?: boolean;
  className?: string;
}

/**
 * Two entry boxes — place search and Plus Code — both answered by Google Maps.
 * One result is applied straight away; several results are listed to choose from.
 */
export default function LocationSearchBox({ onPick, showSearch = true, showPlusCode = true, className = '' }: Props) {
  const [query, setQuery] = useState('');
  const [plus, setPlus] = useState('');
  const [busy, setBusy] = useState<'search' | 'plus' | null>(null);
  const [results, setResults] = useState<GeoResult[]>([]);
  const [error, setError] = useState('');

  const choose = (r: GeoResult) => {
    onPick(r.lat, r.lng, r.address, r.plusCode);
    setResults([]); setQuery(''); setPlus(''); setError('');
  };

  const run = async (text: string, kind: 'search' | 'plus') => {
    if (!text.trim() || busy) return;
    setBusy(kind); setError(''); setResults([]);
    const out = await geocode(text);
    setBusy(null);
    if (out.error) { setError(out.error); return; }
    if (out.results.length === 0) { setError('No matching location found on Google Maps.'); return; }
    // Plus Codes point to one exact spot; a single search hit is also applied directly.
    if (kind === 'plus' || out.results.length === 1) { choose(out.results[0]); return; }
    setResults(out.results);
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {showSearch && (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search a place or address (Google Maps)..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && run(query, 'search')}
              className="pl-8 h-8 text-xs"
            />
          </div>
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => run(query, 'search')} disabled={!!busy}>
            {busy === 'search' ? '...' : 'Search'}
          </Button>
        </div>
      )}

      {showPlusCode && (
        <div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Navigation className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Plus Code (e.g. 6GCRMQFG+R8 or MQFG+R8)"
                value={plus}
                onChange={e => setPlus(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && run(plus, 'plus')}
                className="pl-8 h-8 text-xs"
              />
            </div>
            <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => run(plus, 'plus')} disabled={!!busy}>
              {busy === 'plus' ? '...' : 'Find'}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Short codes are looked up in Nairobi. For another town add its name, e.g. "MQFG+R8 Mombasa".
          </p>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {results.length > 0 && (
        <div className="rounded-md border border-border bg-popover max-h-40 overflow-y-auto">
          {results.map((r, i) => (
            <button
              key={i}
              type="button"
              onClick={() => choose(r)}
              className="w-full text-left px-3 py-2 text-xs hover:bg-muted flex items-start gap-2 border-b border-border last:border-0"
            >
              <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
              <span className="break-words min-w-0">{r.address}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
