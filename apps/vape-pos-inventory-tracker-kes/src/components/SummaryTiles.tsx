// Same colour order as the Dashboard's headline cards.
const TONES = ['blue', 'green', 'pink', 'gold'];

export interface Tile { label: string; value: string; sub?: string }

/**
 * Compact summary tiles in the shared Aurora style: a glowing tone dot, the
 * label, a gradient value and an optional small detail line. Tiles share the
 * row evenly, so 3, 4 or 5 tiles all fit.
 */
export default function SummaryTiles({ items }: { items: Tile[]; small?: boolean }) {
  return (
    <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))]">
      {items.map((it, i) => (
        <div key={it.label} data-tone={TONES[i % 4]} className="stat-tile tile">
          <p className="stat-label">{it.label}</p>
          <p className="stat-value" title={it.value}>{it.value}</p>
          {it.sub && <p className="stat-sub">{it.sub}</p>}
        </div>
      ))}
    </div>
  );
}
