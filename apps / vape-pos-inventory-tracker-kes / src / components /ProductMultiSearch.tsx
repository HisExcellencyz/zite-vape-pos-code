import { useEffect, useMemo, useState } from 'react';
import { getProductSales } from 'zitejs/api';
import { Input } from '@project/components/ui/input';
import { Button } from '@project/components/ui/button';
import { Checkbox } from '@project/components/ui/checkbox';
import { Search, X, Plus } from 'lucide-react';
import DateRangeFilter, { Range, eatBounds } from './DateRangeFilter';

export interface PickItem {
  id: string;
  productName?: string;
  sku?: string;
}

interface Props<T extends PickItem> {
  /** Products that can be searched. */
  items: T[];
  /** Current stock level to show for a product (e.g. total stock, or the quantity in the source storage). */
  stockOf: (item: T) => number;
  /** Product ids already added to the order / transfer: shown as "Added" and cannot be ticked again. */
  addedIds?: string[];
  /** Called with every ticked product when "Add selected" is pressed. */
  onAdd: (items: T[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Date picker + (short) search box. As soon as typing starts, matching products pop up with a checkbox on the left,
 * the current stock level and the pieces sold in the dates picked. Several products can be ticked and added at once.
 */
export default function ProductMultiSearch<T extends PickItem>({
  items, stockOf, addedIds = [], onAdd, disabled, placeholder = 'Search products...',
}: Props<T>) {
  const [range, setRange] = useState<Range>({});
  const [query, setQuery] = useState('');
  const [sold, setSold] = useState<Record<string, number>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    let off = false;
    const b = eatBounds(range);
    getProductSales({
      startDate: Number.isFinite(b.from) ? new Date(b.from).toISOString() : undefined,
      endDate: Number.isFinite(b.to) ? new Date(b.to).toISOString() : undefined,
    })
      .then(r => { if (!off) setSold((r.sold || {}) as Record<string, number>); })
      .catch(() => { if (!off) setSold({}); });
    return () => { off = true; };
  }, [range.start?.getTime(), range.end?.getTime()]);

  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () => (q
      ? items
          .filter(p => (p.productName || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q))
          .sort((a, b) => (a.productName || '').localeCompare(b.productName || ''))
      : []),
    [items, q],
  );

  const added = new Set(addedIds);
  const selectable = matches.filter(p => !added.has(p.id));
  const allTicked = selectable.length > 0 && selectable.every(p => picked.has(p.id));
  const pickedCount = Array.from(picked).filter(id => !added.has(id)).length;

  const toggle = (id: string) =>
    setPicked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = (on: boolean) =>
    setPicked(prev => {
      const next = new Set(prev);
      selectable.forEach(p => (on ? next.add(p.id) : next.delete(p.id)));
      return next;
    });

  const addSelected = () => {
    const chosen = items.filter(p => picked.has(p.id) && !added.has(p.id));
    if (chosen.length === 0) return;
    onAdd(chosen);
    setPicked(new Set());
    setQuery('');
  };

  return (
    <div className="space-y-2">
      {/* Date picker on the left, a shorter search bar beside it */}
      <div className="flex items-center gap-3 flex-wrap">
        <DateRangeFilter value={range} onChange={setRange} />
        <div className="relative w-56 max-w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={placeholder}
            className="pl-9"
            disabled={disabled}
            autoComplete="off"
          />
          {query && (
            <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setQuery('')} aria-label="Clear search">
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
        {pickedCount > 0 && (
          <Button type="button" size="sm" onClick={addSelected}>
            <Plus className="w-4 h-4 mr-1" /> Add selected ({pickedCount})
          </Button>
        )}
      </div>

      {q && (
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border text-xs text-muted-foreground">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox checked={allTicked} disabled={selectable.length === 0} onCheckedChange={v => toggleAll(!!v)} />
              Select all ({selectable.length})
            </label>
            <span className="text-right">Stock now · Sold in the selected dates{range.start || range.end ? '' : ' (all time)'}</span>
          </div>
          {/* About ten products are visible at once; scroll for more */}
          <div className="max-h-[28rem] overflow-y-auto">
            {matches.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground text-center">No matching products</p>
            ) : matches.map(p => {
              const isAdded = added.has(p.id);
              return (
                <label
                  key={p.id}
                  className={`flex items-center gap-3 px-3 py-2 border-b border-border last:border-0 text-sm ${isAdded ? 'opacity-50' : 'cursor-pointer hover:bg-muted/50'}`}
                >
                  <Checkbox checked={isAdded || picked.has(p.id)} disabled={isAdded} onCheckedChange={() => toggle(p.id)} />
                  <span className="flex-1 min-w-0">
                    <span className="block break-words whitespace-normal text-foreground">{p.productName}</span>
                    <span className="block text-xs text-muted-foreground font-mono break-all">{p.sku}{isAdded ? ' · Added' : ''}</span>
                  </span>
                  <span className="shrink-0 text-xs text-right leading-tight">
                    <span className="block text-emerald-400 font-semibold">{stockOf(p)} in stock</span>
                    <span className="block text-sky-400">{sold[p.id] || 0} sold</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
