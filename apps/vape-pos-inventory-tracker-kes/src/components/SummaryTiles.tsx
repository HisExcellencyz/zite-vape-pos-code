import { cn } from '@project/components/lib/utils';

const TONES = ['gold', 'pink', 'blue', 'green'];

/**
 * Summary tiles in the shared Aurora style: compact label + value with a
 * rotating gold / pink / blue / green accent. The `sub` line isn't shown.
 */
export default function SummaryTiles({ items, small }: { items: { label: string; value: string; sub?: string }[]; small?: boolean }) {
  return (
    <div className={cn('grid gap-3', small ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 lg:grid-cols-4')}>
      {items.map((it, i) => (
        <div key={it.label} data-tone={TONES[i % 4]} className="stat-tile tile">
          <p className="stat-label">{it.label}</p>
          <p className="stat-value">{it.value}</p>
        </div>
      ))}
    </div>
  );
}
