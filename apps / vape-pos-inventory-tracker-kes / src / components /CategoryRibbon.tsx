import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { cn } from '@project/components/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@project/components/ui/dropdown-menu';

/** A category as returned by getCategories. parentId is set for sub-categories (two levels only). */
export interface CategoryLite {
  id: string;
  categoryName?: string;
  parentId?: string | null;
  active?: boolean;
}

/** The category id stored on a product (a linked-record field, so it may come back as an array). */
export const productCategoryId = (p: { category?: string | string[] | null }): string =>
  (Array.isArray(p.category) ? p.category[0] : p.category) || '';

const byName = (a: CategoryLite, b: CategoryLite) => (a.categoryName || '').localeCompare(b.categoryName || '');

/** Splits categories into top-level ones and the sub-categories under each. A sub-category whose parent is missing counts as top-level. */
export function buildCategoryTree(categories: CategoryLite[]) {
  const byId = new Map(categories.map(c => [c.id, c]));
  const isSub = (c: CategoryLite) => !!c.parentId && c.parentId !== c.id && byId.has(c.parentId);
  const tops = categories.filter(c => !isSub(c)).sort(byName);
  const kids = new Map<string, CategoryLite[]>();
  categories.filter(isSub).sort(byName).forEach(c => {
    const list = kids.get(c.parentId as string) || [];
    list.push(c);
    kids.set(c.parentId as string, list);
  });
  return { byId, tops, kids };
}

/** Flat, ordered list for dropdowns: each category followed by its sub-categories ("Parent › Child"). */
export function flattenCategories(categories: CategoryLite[]): { id: string; label: string; depth: number }[] {
  const { tops, kids } = buildCategoryTree(categories);
  const out: { id: string; label: string; depth: number }[] = [];
  for (const t of tops) {
    out.push({ id: t.id, label: t.categoryName || '(unnamed)', depth: 0 });
    for (const k of kids.get(t.id) || []) out.push({ id: k.id, label: `${t.categoryName} › ${k.categoryName}`, depth: 1 });
  }
  return out;
}

/** True when a product (by its category id) belongs to the ribbon selection. Selecting a category includes its sub-categories. */
export function matchesCategory(selected: string | null, productCatId: string, categories: CategoryLite[]): boolean {
  if (!selected) return true;
  if (!productCatId) return false;
  if (productCatId === selected) return true;
  const { kids } = buildCategoryTree(categories);
  return (kids.get(selected) || []).some(k => k.id === productCatId);
}

type Item = { key: string; label: string; state: 'active' | 'parent' | 'idle'; clearable?: boolean; onClick: () => void };

const GAP = 8; // px, matches gap-2

/**
 * Category ribbon for the POS and Inventory headers.
 * - Nothing selected: "All" followed by the top-level categories.
 * - A category selected: only that category and its sub-categories remain (click the category again to go back to All).
 * - Chips that do not fit in one row move into a "More..." drop-down.
 */
export default function CategoryRibbon({ categories, selected, onSelect, className }: {
  categories: CategoryLite[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  className?: string;
}) {
  const live = useMemo(() => categories.filter(c => c.active !== false), [categories]);
  const { byId, tops, kids } = useMemo(() => buildCategoryTree(live), [live]);
  const sel = selected && byId.has(selected) ? selected : null;
  const selCat = sel ? byId.get(sel) : undefined;
  const topOfSel = selCat ? (selCat.parentId && byId.has(selCat.parentId) ? byId.get(selCat.parentId)! : selCat) : undefined;

  const items: Item[] = useMemo(() => {
    if (!topOfSel) {
      return [
        { key: 'all', label: 'All', state: 'active' as const, onClick: () => onSelect(null) },
        ...tops.map(c => ({ key: c.id, label: c.categoryName || '(unnamed)', state: 'idle' as const, onClick: () => onSelect(c.id) })),
      ];
    }
    const parentSelected = sel === topOfSel.id;
    return [
      {
        key: topOfSel.id,
        label: topOfSel.categoryName || '(unnamed)',
        state: parentSelected ? 'active' : 'parent',
        clearable: parentSelected,
        onClick: () => onSelect(parentSelected ? null : topOfSel.id),
      },
      ...(kids.get(topOfSel.id) || []).map(c => ({
        key: c.id,
        label: c.categoryName || '(unnamed)',
        state: sel === c.id ? ('active' as const) : ('idle' as const),
        clearable: sel === c.id,
        // Clicking the chosen sub-category again steps back up to its parent.
        onClick: () => onSelect(sel === c.id ? topOfSel.id : c.id),
      })),
    ];
  }, [topOfSel, sel, tops, kids, onSelect]);

  const shown = items;

  const wrapRef = useRef<HTMLDivElement>(null);
  const measRef = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(shown.length);
  const signature = shown.map(i => `${i.key}:${i.label}:${i.state}`).join('|');

  useLayoutEffect(() => {
    const recalc = () => {
      const wrap = wrapRef.current, meas = measRef.current;
      if (!wrap || !meas) return;
      const widths = (Array.from(meas.children) as HTMLElement[]).map(el => el.offsetWidth);
      const moreW = widths.pop() ?? 90; // the last measured child is the "More..." button
      const avail = wrap.clientWidth;
      const total = widths.reduce((a, w) => a + w, 0) + GAP * Math.max(0, widths.length - 1);
      if (total <= avail) { setCount(widths.length); return; }
      let used = 0, n = 0;
      for (let i = 0; i < widths.length; i++) {
        const need = widths[i] + (i > 0 ? GAP : 0);
        if (used + need + GAP + moreW <= avail) { used += need; n++; } else break;
      }
      setCount(Math.max(1, n));
    };
    recalc();
    const ro = new ResizeObserver(recalc);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [signature]);

  if (tops.length === 0) return null;

  // Keep the chosen chip visible even if it would have landed in the drop-down.
  let visible = shown.slice(0, count);
  let hidden = shown.slice(count);
  const activeHidden = hidden.find(i => i.state === 'active');
  if (activeHidden && visible.length > 0) {
    const swapped = visible[visible.length - 1];
    visible = [...visible.slice(0, -1), activeHidden];
    hidden = [swapped, ...hidden.filter(i => i !== activeHidden)];
  }

  const chip = (i: Item, measuring = false) => (
    <button
      key={i.key}
      type="button"
      aria-pressed={i.state === 'active'}
      tabIndex={measuring ? -1 : undefined}
      onClick={measuring ? undefined : i.onClick}
      className={cn(
        'inline-flex items-center gap-1 shrink-0 h-8 px-3 rounded-full border text-xs font-medium whitespace-nowrap transition-colors',
        i.state === 'active' && 'bg-primary text-primary-foreground border-primary',
        i.state === 'parent' && 'border-primary/60 text-primary bg-primary/10',
        i.state === 'idle' && 'bg-card border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
      )}
    >
      {i.label}
      {i.clearable && <X className="w-3 h-3 opacity-80" aria-hidden />}
    </button>
  );

  const moreBtn = (measuring = false) => (
    <button
      type="button"
      tabIndex={measuring ? -1 : undefined}
      className="inline-flex items-center gap-1 shrink-0 h-8 px-3 rounded-full border border-border bg-card text-xs font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground whitespace-nowrap"
    >
      More... <ChevronDown className="w-3 h-3" aria-hidden />
    </button>
  );

  return (
    <div ref={wrapRef} role="group" aria-label="Product categories" className={cn('relative w-full overflow-hidden', className)}>
      <div className="flex items-center gap-2">
        {visible.map(i => chip(i))}
        {hidden.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>{moreBtn()}</DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
              {hidden.map(i => (
                <DropdownMenuItem key={i.key} onSelect={i.onClick} className="gap-2">
                  {i.state === 'active' ? <Check className="w-3.5 h-3.5" /> : <span className="w-3.5" />}
                  {i.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {/* Invisible copy of every chip, used only to measure how many fit in one row. */}
      <div ref={measRef} aria-hidden className="absolute left-0 top-0 flex w-max gap-2 invisible pointer-events-none">
        {shown.map(i => chip(i, true))}
        {moreBtn(true)}
      </div>
    </div>
  );
}
