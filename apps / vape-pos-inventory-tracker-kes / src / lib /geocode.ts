/**
 * Shared Google Maps lookup used by every location dialog (customers,
 * suppliers, outlets, addresses, delivery routes). Free-text search, Plus
 * Codes and picked suggestions all go through Google's Geocoding API with the
 * app's existing Google Maps key, so they return real Google results.
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

/** Reads a saved "lat,lng" string. Returns null when it isn't a valid pair. */
export function parseCoordinates(value?: string | null): { lat: number; lng: number } | null {
  if (!value) return null;
  const parts = value.split(',').map(s => s.trim());
  if (parts.length !== 2) return null;
  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);
  if (!isFinite(lat) || !isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

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

function parseResponse(data: any, fallback: string): GeoOutcome {
  if (data.status === 'ZERO_RESULTS') {
    return { results: [], error: 'No matching location found on Google Maps.' };
  }
  if (data.status !== 'OK') {
    return { results: [], error: data.error_message || `Google Maps error: ${data.status}` };
  }
  const results: GeoResult[] = (data.results || []).slice(0, 5).map((r: any) => ({
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    address: r.formatted_address || fallback,
    plusCode: r.plus_code?.global_code,
  }));
  return { results };
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
    return parseResponse(await resp.json(), q);
  } catch {
    return { results: [], error: 'Could not reach Google Maps. Check your connection.' };
  }
}

/** Resolves a suggestion picked from the autocomplete list to exact coordinates. */
export async function geocodePlaceId(placeId: string): Promise<GeoOutcome> {
  const key = import.meta.env.VITE_GOOGLEMAPS_API_KEY;
  if (!key) return { results: [], error: 'Google Maps not connected.' };
  if (!placeId) return { results: [] };

  try {
    const resp = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?place_id=${encodeURIComponent(placeId)}&key=${key}`,
    );
    return parseResponse(await resp.json(), '');
  } catch {
    return { results: [], error: 'Could not reach Google Maps. Check your connection.' };
  }
}
