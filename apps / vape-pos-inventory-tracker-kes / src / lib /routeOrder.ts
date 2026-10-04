// Keeps delivery route points in a fixed order, whatever order they were added in:
// Start -> Pick-ups -> (untagged pins) -> Drop-offs -> End.
export const RET_ID = 'ret_end'; // the auto-filled End point used when "Return to start" is on

const RANK: Record<string, number> = { start: 0, pickup: 1, dropoff: 3, end: 4 };

export function sortRoute<T extends { tag?: string }>(pts: T[]): T[] {
  const rank = (p: T) => (p.tag && p.tag in RANK ? RANK[p.tag] : 2);
  return pts
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i)
    .map(x => x.p);
}
