// Delivery route order: Start -> Pick-ups -> other pins -> Drop-offs -> End.
// (A "return to start" leg is always added after the End by the route calculator.)
const rank = (tag?: string) => (tag === 'start' ? 0 : tag === 'pickup' ? 1 : tag === 'dropoff' ? 3 : tag === 'end' ? 4 : 2);

/** Sorts route points into the fixed order above, keeping the order they were added within each group. */
export function sortRoutePoints<T extends { tag?: string }>(pts: T[]): T[] {
  return pts
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rank(a.p.tag) - rank(b.p.tag) || a.i - b.i)
    .map(x => x.p);
}
