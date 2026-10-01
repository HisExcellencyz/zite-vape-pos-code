import { cn } from '@project/components/lib/utils';

const COLORS = ['text-pink-500', 'text-amber-500', 'text-sky-500', 'text-emerald-500'];
const EDGES = ['border-l-pink-500', 'border-l-amber-500', 'border-l-sky-500', 'border-l-emerald-500'];

export default function SummaryTiles({ items, small }: { items: { label: string; value: string; sub?: string }[]; small?: boolean }) {
  return (
    <div className={cn('grid gap-3', small ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 lg:grid-cols-4')}>
      {items.map((it, i) => (
        <div key={it.label} className={cn('bg-card border border-border rounded-xl border-l-4', EDGES[i % 4], small ? 'px-3 py-2' : 'p-4')}>
          <p className={cn('uppercase tracking-wider text-muted-foreground', small ? 'text-[10px]' : 'text-xs')}>{it.label}</p>
          <p className={cn('font-bold', COLORS[i % 4], small ? 'text-sm' : 'text-xl mt-1')}>{it.value}</p>
          {it.sub && !small && <p className="text-xs text-muted-foreground mt-0.5">{it.sub}</p>}
        </div>
      ))}
    </div>
  );
}
