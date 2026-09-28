/**
 * Shared Google Maps lookup used by every location dialog (customers,
 * suppliers, outlets, addresses, delivery routes). Both free-text search and
 * Plus Codes go through Google's Geocoding API with the app's existing
 * Google Maps key, so they return real Google results.
 */

export interface GeoResult {
  lat: number;
  lng: number;
  address: string;
  plusCode?: string;
}

export interface GeoOutcome {
  results: GeoResult[];
  error?: string;
}

// Open Location Code alphabet. Full codes look like 6GCRMQFG+R8, short ones like MQFG+R8.
const PLUS_RE = /^\s*[23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{2,}(\s|$)/i;

export const isPlusCode = (s: string) => PLUS_RE.test(s || '');

/**
 * Short Plus Codes (e.g. "MQFG+R8") need a town to be located. If none was
 * typed we assume Nairobi; typing "MQFG+R8 Mombasa" overrides that.
 */
export function normalizePlusCode(input: string, fallbackLocality = 'Nairobi, Kenya'): string {
  const v = (input || '').trim();
  if (!isPlusCode(v)) return v;
  const code = v.split(/\s+/)[0];
  const rest = v.slice(code.length).trim();
  const isShort = code.indexOf('+') < 8;
  if (isShort && !rest) return `${code} ${fallbackLocality}`;
  return v;
}

export async function geocode(query: string): Promise<GeoOutcome> {
  const key = import.meta.env.VITE_GOOGLEMAPS_API_KEY;
  if (!key) return { results: [], error: 'Google Maps not connected.' };

  const q = normalizePlusCode(query);
  if (!q) return { results: [] };

  try {
    const resp = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&region=ke&key=${key}`,
    );
    const data = await resp.json();

    if (data.status === 'ZERO_RESULTS') {
      return { results: [], error: 'No matching location found on Google Maps.' };
    }
    if (data.status !== 'OK') {
      return { results: [], error: data.error_message || `Google Maps error: ${data.status}` };
    }

    const results: GeoResult[] = (data.results || []).slice(0, 5).map((r: any) => ({
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
      address: r.formatted_address || q,
      plusCode: r.plus_code?.global_code,
    }));
    return { results };
  } catch {
    return { results: [], error: 'Could not reach Google Maps. Check your connection.' };
  }
}
