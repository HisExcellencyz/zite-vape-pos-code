import { useState, useRef, useEffect, useCallback } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
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

interface Prediction {
  description: string;
  placeId: string;
}

// Shared across every instance of this component so the Places library and
// the AutocompleteService are only ever loaded/created once per page.
let placesServicePromise: Promise<google.maps.places.AutocompleteService> | null = null;
function getAutocompleteService(apiKey: string): Promise<google.maps.places.AutocompleteService> {
  if (!placesServicePromise) {
    const loader = new Loader({ apiKey, version: 'weekly', libraries: ['places'] });
    placesServicePromise = loader.importLibrary('places').then(
      ({ AutocompleteService }) => new AutocompleteService(),
    );
  }
  return placesServicePromise;
}

/**
 * Two entry boxes — place search and Plus Code — both answered by Google Maps.
 * As the person types, matching suggestions appear below the box (so they
 * don't need to type the full name or code); picking one, or pressing Enter /
 * the button, resolves it to a location. A single geocoded hit is applied
 * straight away; several hits are listed to choose from.
 */
export default function LocationSearchBox({ onPick, showSearch = true, showPlusCode = true, className = '' }: Props) {
  const apiKey = import.meta.env.VITE_GOOGLEMAPS_API_KEY;

  const [query, setQuery] = useState('');
  const [plus, setPlus] = useState('');
  const [busy, setBusy] = useState<'search' | 'plus' | null>(null);
  const [results, setResults] = useState<GeoResult[]>([]);
  const [error, setError] = useState('');

  const [searchSuggestions, setSearchSuggestions] = useState<Prediction[]>([]);
  const [plusSuggestions, setPlusSuggestions] = useState<Prediction[]>([]);
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [showPlusSuggestions, setShowPlusSuggestions] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout>>();
  const plusDebounce = useRef<ReturnType<typeof setTimeout>>();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSearchSuggestions(false);
        setShowPlusSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => () => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (plusDebounce.current) clearTimeout(plusDebounce.current);
  }, []);

  const fetchPredictions = useCallback((text: string, setter: (p: Prediction[]) => void) => {
    if (!apiKey || !text.trim()) { setter([]); return; }
    getAutocompleteService(apiKey).then(service => {
      service.getPlacePredictions(
        { input: text, componentRestrictions: { country: 'ke' } },
        (predictions, status) => {
          if (status !== google.maps.places.PlacesServiceStatus.OK || !predictions) {
            setter([]);
            return;
          }
          setter(predictions.map(p => ({ description: p.description, placeId: p.place_id })));
        },
      );
    }).catch(() => setter([]));
  }, [apiKey]);

  const handleSearchChange = (val: string) => {
    setQuery(val);
    setShowSearchSuggestions(true);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => fetchPredictions(val, setSearchSuggestions), 250);
  };

  const handlePlusChange = (val: string) => {
    setPlus(val);
    setShowPlusSuggestions(true);
    if (plusDebounce.current) clearTimeout(plusDebounce.current);
    plusDebounce.current = setTimeout(() => fetchPredictions(val, setPlusSuggestions), 250);
  };

  const choose = (r: GeoResult) => {
    onPick(r.lat, r.lng, r.address, r.plusCode);
    setResults([]); setQuery(''); setPlus(''); setError('');
    setSearchSuggestions([]); setPlusSuggestions([]);
    setShowSearchSuggestions(false); setShowPlusSuggestions(false);
  };

  const run = async (text: string, kind: 'search' | 'plus') => {
    if (!text.trim() || busy) return;
    setShowSearchSuggestions(false); setShowPlusSuggestions(false);
    setBusy(kind); setError(''); setResults([]);
    const out = await geocode(text);
    setBusy(null);
    if (out.error) { setError(out.error); return; }
    if (out.results.length === 0) { setError('No matching location found on Google Maps.'); return; }
    // Plus Codes point to one exact spot; a single search hit is also applied directly.
    if (kind === 'plus' || out.results.length === 1) { choose(out.results[0]); return; }
    setResults(out.results);
  };

  const choosePrediction = (description: string, kind: 'search' | 'plus') => {
    if (kind === 'search') setQuery(description); else setPlus(description);
    run(description, kind);
  };

  return (
    <div ref={wrapperRef} className={`space-y-2 ${className}`}>
      {showSearch && (
        <div className="relative">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search a place or address (Google Maps)..."
                value={query}
                onChange={e => handleSearchChange(e.target.value)}
                onFocus={() => { if (query && searchSuggestions.length > 0) setShowSearchSuggestions(true); }}
                onKeyDown={e => e.key === 'Enter' && run(query, 'search')}
                className="pl-8 h-8 text-xs"
                autoComplete="off"
              />
            </div>
            <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => run(query, 'search')} disabled={!!busy}>
              {busy === 'search' ? '...' : 'Search'}
            </Button>
          </div>
          {showSearchSuggestions && searchSuggestions.length > 0 && (
            <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md max-h-48 overflow-y-auto">
              {searchSuggestions.map(s => (
                <button
                  key={s.placeId}
                  type="button"
                  onClick={() => choosePrediction(s.description, 'search')}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-muted flex items-start gap-2 border-b border-border last:border-0"
                >
                  <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
                  <span className="break-words min-w-0">{s.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {showPlusCode && (
        <div className="relative">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Navigation className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Plus Code (e.g. 6GCRMQFG+R8 or MQFG+R8)"
                value={plus}
                onChange={e => handlePlusChange(e.target.value)}
                onFocus={() => { if (plus && plusSuggestions.length > 0) setShowPlusSuggestions(true); }}
                onKeyDown={e => e.key === 'Enter' && run(plus, 'plus')}
                className="pl-8 h-8 text-xs"
                autoComplete="off"
              />
            </div>
            <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => run(plus, 'plus')} disabled={!!busy}>
              {busy === 'plus' ? '...' : 'Find'}
            </Button>
          </div>
          {showPlusSuggestions && plusSuggestions.length > 0 && (
            <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md max-h-48 overflow-y-auto">
              {plusSuggestions.map(s => (
                <button
                  key={s.placeId}
                  type="button"
                  onClick={() => choosePrediction(s.description, 'plus')}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-muted flex items-start gap-2 border-b border-border last:border-0"
                >
                  <Navigation className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
                  <span className="break-words min-w-0">{s.description}</span>
                </button>
              ))}
            </div>
          )}
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
