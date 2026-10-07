import { cn } from '@project/components/lib/utils';

const COLORS = ['text-pink-500', 'text-amber-500', 'text-sky-500', 'text-emerald-500'];
const EDGES = ['border-l-pink-500', 'border-l-amber-500', 'border-l-sky-500', 'border-l-emerald-500'];

/**
 * Summary tiles. Every page now uses the same compact height as the POS tiles
 * (small label, one line of value), so the `sub` line is no longer shown.
 */
export default function SummaryTiles({ items, small }: { items: { label: string; value: string; sub?: string }[]; small?: boolean }) {
  return (
    <div className={cn('grid gap-3', small ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 lg:grid-cols-4')}>
      {items.map((it, i) => (
        <div key={it.label} className={cn('bg-card border border-border rounded-xl border-l-4 px-3 py-2', EDGES[i % 4])}>
          <p className="uppercase tracking-wider text-muted-foreground text-[10px]">{it.label}</p>
          <p className={cn('font-bold text-sm', COLORS[i % 4])}>{it.value}</p>
        </div>
      ))}
    </div>
  );
}
