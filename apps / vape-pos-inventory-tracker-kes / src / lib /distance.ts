// Real riding-distance calculation for delivery routes.
//
// Google's classic Distance Matrix API ("maps/api/distancematrix/json") only
// supports driving/walking/bicycling/transit and has no `routingPreference`
// parameter. `travelMode: 'TWO_WHEELER'` and `routingPreference:
// 'TRAFFIC_UNAWARE'` only exist on the newer Routes API
// (routes.googleapis.com), so that is what this calls. Its raw response is a
// flat array of { originIndex, destinationIndex, distanceMeters, condition }
// objects — this file normalizes that into the familiar
// rows -> elements -> distance { text, value } shape so the rest of the app
// can read it exactly like the classic Distance Matrix response.

export interface LatLng {
  lat: number;
  lng: number;
}

export interface DistanceElement {
  status: 'OK' | 'ZERO_RESULTS' | 'NOT_FOUND';
  /** value is in meters, text is a short human label like "3.2 km" */
  distance?: { text: string; value: number };
}

export interface DistanceMatrixResponse {
  rows: { elements: DistanceElement[] }[];
}

export type RoutingTravelMode = 'TWO_WHEELER' | 'BICYCLE';

export interface RoadDistanceResult {
  /** Total distance in kilometers, rounded to 2 decimal places. */
  km: number;
  /** Human-readable total, e.g. "4.6 km". */
  text: string;
  /** Which method actually produced the number, for display/debugging. */
  mode: RoutingTravelMode | 'straight-line';
}

function humanizeMeters(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/**
 * Calls Google's Routes API (computeRouteMatrix) for each consecutive pair of
 * points along the route and returns a classic-shaped
 * { rows: [{ elements: [{ distance: { text, value } }] }] } response — one
 * row per leg of the journey, in order.
 *
 * `routingPreference` is only meaningful for DRIVE/TWO_WHEELER (bicycles
 * aren't affected by traffic), so it's omitted for BICYCLE.
 */
async function fetchRouteMatrix(
  points: LatLng[],
  apiKey: string,
  travelMode: RoutingTravelMode,
): Promise<DistanceMatrixResponse> {
  if (points.length < 2) return { rows: [] };

  const toWaypoint = (p: LatLng) => ({
    waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } },
  });

  const origins = points.slice(0, -1).map(toWaypoint);
  const destinations = points.slice(1).map(toWaypoint);

  const body: Record<string, unknown> = {
    origins,
    destinations,
    travelMode,
  };
  if (travelMode === 'TWO_WHEELER') {
    body.routingPreference = 'TRAFFIC_UNAWARE';
  }

  const resp = await fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      // Routes API returns no fields at all unless explicitly asked for —
      // this is what makes distanceMeters/condition actually come back.
      'X-Goog-FieldMask': 'originIndex,destinationIndex,distanceMeters,condition',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`Routes API ${travelMode} request failed (HTTP ${resp.status}): ${detail.slice(0, 200)}`);
  }

  const raw: Array<{ originIndex?: number; destinationIndex?: number; distanceMeters?: number; condition?: string }> =
    await resp.json();

  // Each leg i is origins[i] -> destinations[i] (same index on both sides,
  // since we paired them up 1:1 above) — keep only that matching pair per
  // leg, not the full cross-product the API is capable of returning.
  const rows: { elements: DistanceElement[] }[] = origins.map((_, i) => {
    const match = raw.find(el => el.originIndex === i && el.destinationIndex === i);
    if (match && match.condition === 'ROUTE_EXISTS' && typeof match.distanceMeters === 'number') {
      return {
        elements: [
          {
            status: 'OK',
            distance: { text: humanizeMeters(match.distanceMeters), value: match.distanceMeters },
          },
        ],
      };
    }
    return { elements: [{ status: 'ZERO_RESULTS' }] };
  });

  return { rows };
}

function sumMatrixMeters(matrix: DistanceMatrixResponse): number | null {
  let total = 0;
  for (const row of matrix.rows) {
    const el = row.elements[0];
    if (!el || el.status !== 'OK' || !el.distance) return null; // any missing leg invalidates the total
    total += el.distance.value;
  }
  return total;
}

/**
 * Returns the single shortest real riding distance (in km) for an ordered
 * list of stops, trying TWO_WHEELER first, then BICYCLE, then falling back
 * to a straight-line estimate if neither road-based mode is available
 * (e.g. TWO_WHEELER routing isn't supported in every country yet).
 */
export async function getShortestRidingDistanceKm(
  points: LatLng[],
  apiKey?: string,
): Promise<RoadDistanceResult> {
  if (points.length < 2) {
    return { km: 0, text: '0 km', mode: 'straight-line' };
  }

  if (apiKey) {
    for (const mode of ['TWO_WHEELER', 'BICYCLE'] as RoutingTravelMode[]) {
      try {
        const matrix = await fetchRouteMatrix(points, apiKey, mode);
        const meters = sumMatrixMeters(matrix);
        if (meters != null) {
          const km = Math.round((meters / 1000) * 100) / 100;
          return { km, text: humanizeMeters(meters), mode };
        }
      } catch {
        // try the next mode
      }
    }
  }

  // Last resort: straight-line distance, clearly labelled as an estimate.
  let totalKm = 0;
  for (let i = 0; i < points.length - 1; i++) {
    totalKm += haversineKm(points[i], points[i + 1]);
  }
  const km = Math.round(totalKm * 100) / 100;
  return { km, text: `${km.toFixed(1)} km (estimated)`, mode: 'straight-line' };
}
