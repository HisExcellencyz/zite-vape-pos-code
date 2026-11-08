import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, X } from 'lucide-react';
import { cn } from '@project/components/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@project/components/ui/dropdown-menu';

/** A category as returned by getCategories. parentId is set for sub-categories, at any depth. */
export interface CategoryLite {
  id: string;
  categoryName?: string;
  parentId?: string | null;
  active?: boolean;
  description?: string;
}

/** The category id stored on a product (a linked-record field, so it may come back as an array). */
export const productCategoryId = (p: { category?: string | string[] | null }): string =>
  (Array.isArray(p.category) ? p.category[0] : p.category) || '';

const byName = (a: CategoryLite, b: CategoryLite) => (a.categoryName || '').localeCompare(b.categoryName || '');

/**
 * Multi-tier category tree. `tops` are the categories with no parent; `kids` maps every category id to the
 * categories directly under it, at any depth. A parent that no longer exists (or a loop) makes a category top-level.
 */
export function buildCategoryTree(categories: CategoryLite[]) {
  const byId = new Map(categories.map(c => [c.id, c]));
  // Walk up from each category; if the chain loops or breaks, treat the category as top-level.
  const validParent = (c: CategoryLite): string | null => {
    const pid = c.parentId;
    if (!pid || pid === c.id || !byId.has(pid)) return null;
    const seen = new Set<string>([c.id]);
    let cur: string | null | undefined = pid;
    while (cur) {
      if (seen.has(cur)) return null;
      seen.add(cur);
      const next = byId.get(cur)?.parentId;
      cur = next && byId.has(next) ? next : null;
    }
    return pid;
  };
  const parentOf = new Map<string, string | null>(categories.map(c => [c.id, validParent(c)]));
  const tops = categories.filter(c => !parentOf.get(c.id)).sort(byName);
  const kids = new Map<string, CategoryLite[]>();
  categories.filter(c => parentOf.get(c.id)).sort(byName).forEach(c => {
    const pid = parentOf.get(c.id) as string;
    kids.set(pid, [...(kids.get(pid) || []), c]);
  });
  /** The chain from the top-level category down to (not including) this one. */
  const ancestorsOf = (id: string): CategoryLite[] => {
    const out: CategoryLite[] = [];
    let cur = parentOf.get(id);
    while (cur) { const c = byId.get(cur); if (!c) break; out.unshift(c); cur = parentOf.get(cur); }
    return out;
  };
  /** Every category under this one, at any depth. */
  const descendantsOf = (id: string): string[] => {
    const out: string[] = [];
    const stack = [...(kids.get(id) || [])];
    while (stack.length) { const c = stack.pop()!; out.push(c.id); stack.push(...(kids.get(c.id) || [])); }
    return out;
  };
  /** "Parent › Child › Grandchild" */
  const pathLabel = (id: string) => [...ancestorsOf(id), byId.get(id)].filter(Boolean).map(c => c!.categoryName || '(unnamed)').join(' › ');
  return { byId, tops, kids, parentOf, ancestorsOf, descendantsOf, pathLabel };
}

/** Flat, ordered list for drop-downs: every category, depth-first, labelled with its full path. */
export function flattenCategories(categories: CategoryLite[]): { id: string; label: string; depth: number }[] {
  const { tops, kids, pathLabel } = buildCategoryTree(categories);
  const out: { id: string; label: string; depth: number }[] = [];
  const walk = (c: CategoryLite, depth: number) => {
    out.push({ id: c.id, label: pathLabel(c.id), depth });
    (kids.get(c.id) || []).forEach(k => walk(k, depth + 1));
  };
  tops.forEach(t => walk(t, 0));
  return out;
}

/** True when a product (by its category id) belongs to the ribbon selection: the category itself or anything under it, at any depth. */
export function matchesCategory(selected: string | null, productCatId: string, categories: CategoryLite[]): boolean {
  if (!selected) return true;
  if (!productCatId) return false;
  if (productCatId === selected) return true;
  return treeFor(categories).ancestorsOf(productCatId).some(a => a.id === selected);
}

// Pages call matchesCategory once per product with the same category list, so the tree is built once per list.
const treeCache = new WeakMap<CategoryLite[], ReturnType<typeof buildCategoryTree>>();
function treeFor(categories: CategoryLite[]) {
  let t = treeCache.get(categories);
  if (!t) { t = buildCategoryTree(categories); treeCache.set(categories, t); }
  return t;
}

type Item = { key: string; label: string; state: 'all' | 'active' | 'parent' | 'idle'; clearable?: boolean; onClick: () => void };

const GAP = 8; // px, matches gap-2

/**
 * Category ribbon for the POS and Inventory headers.
 * - "All" is always the first button.
 * - Nothing selected: All, then the top-level categories.
 * - A category selected: the other categories disappear. The ribbon shows All, the path down to the chosen
 *   category (tap a step to go back up to it), the chosen category, then the categories directly under it.
 *   Tap the chosen category again to go up one level.
 * - Chips that do not fit in one row move into a "More..." drop-down; the chosen one always stays visible.
 */
export default function CategoryRibbon({ categories, selected, onSelect, className }: {
  categories: CategoryLite[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  className?: string;
}) {
  const live = useMemo(() => categories.filter(c => c.active !== false), [categories]);
  const tree = useMemo(() => buildCategoryTree(live), [live]);
  const sel = selected && tree.byId.has(selected) ? selected : null;

  const items: Item[] = useMemo(() => {
    const all: Item = { key: 'all', label: 'All', state: sel ? 'all' : 'active', onClick: () => onSelect(null) };
    if (!sel) {
      return [all, ...tree.tops.map(c => ({ key: c.id, label: c.categoryName || '(unnamed)', state: 'idle' as const, onClick: () => onSelect(c.id) }))];
    }
    const path = tree.ancestorsOf(sel);
    const up = path.length ? path[path.length - 1].id : null;
    return [
      all,
      ...path.map(a => ({ key: a.id, label: a.categoryName || '(unnamed)', state: 'parent' as const, onClick: () => onSelect(a.id) })),
      { key: sel, label: tree.byId.get(sel)?.categoryName || '(unnamed)', state: 'active' as const, clearable: true, onClick: () => onSelect(up) },
      ...(tree.kids.get(sel) || []).map(c => ({ key: c.id, label: c.categoryName || '(unnamed)', state: 'idle' as const, onClick: () => onSelect(c.id) })),
    ];
  }, [sel, tree, onSelect]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const measRef = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(items.length);
  const signature = items.map(i => `${i.key}:${i.label}:${i.state}`).join('|');

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

  if (tree.tops.length === 0) return null;

  // Keep the chosen chip visible even if it would have landed in the drop-down.
  let visible = items.slice(0, count);
  let hidden = items.slice(count);
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
        (i.state === 'idle' || i.state === 'all') && 'bg-card border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
      )}
    >
      {i.label}
      {i.state === 'parent' && <ChevronRight className="w-3 h-3 opacity-70" aria-hidden />}
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
        {items.map(i => chip(i, true))}
        {moreBtn(true)}
      </div>
    </div>
  );
}
