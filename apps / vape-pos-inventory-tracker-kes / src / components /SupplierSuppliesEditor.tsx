import { useEffect, useMemo, useState } from 'react';
import { getProducts, getCategories, manageSupplierSupplies } from 'zitejs/api';
import { Input } from '@project/components/ui/input';
import { Button } from '@project/components/ui/button';
import { Checkbox } from '@project/components/ui/checkbox';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { buildCategoryTree, flattenCategories, productCategoryId, CategoryLite } from './CategoryRibbon';

interface Product { id: string; productName?: string; sku?: string; category?: string | string[]; }

/** Tick the categories and products a supplier supplies. A ticked category covers all products in it (and its subcategories). */
export default function SupplierSuppliesEditor({ supplierId, canEdit }: { supplierId: string; canEdit: boolean }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<CategoryLite[]>([]);
  const [prodIds, setProdIds] = useState<Set<string>>(new Set());
  const [catIds, setCatIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let off = false;
    setLoading(true);
    Promise.all([getProducts({}), getCategories({}), manageSupplierSupplies({ action: 'get', supplierId })])
      .then(([p, c, s]) => {
        if (off) return;
        setProducts(p.products as Product[]);
        setCategories(c.categories as CategoryLite[]);
        setProdIds(new Set(s.productIds));
        setCatIds(new Set(s.categoryIds));
      })
      .catch(() => { if (!off) toast.error('Could not load what this supplier supplies'); })
      .finally(() => { if (!off) setLoading(false); });
    return () => { off = true; };
  }, [supplierId]);

  const catOptions = useMemo(() => flattenCategories(categories), [categories]);

  // Product ids covered by a ticked category (including its subcategories).
  const covered = useMemo(() => {
    const { kids } = buildCategoryTree(categories);
    const ids = new Set<string>();
    catIds.forEach(cid => { ids.add(cid); (kids.get(cid) || []).forEach(k => ids.add(k.id)); });
    return ids;
  }, [categories, catIds]);
  const viaCategory = (p: Product) => covered.has(productCategoryId(p));

  const q = query.trim().toLowerCase();
  const shown = products
    .filter(p => !q || (p.productName || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q))
    .sort((a, b) => (a.productName || '').localeCompare(b.productName || ''));
  const allShownTicked = shown.length > 0 && shown.every(p => prodIds.has(p.id));

  const flip = (set: Set<string>, id: string, on?: boolean) => {
    const next = new Set(set);
    const want = on ?? !next.has(id);
    if (want) next.add(id); else next.delete(id);
    return next;
  };

  const toggleAllShown = (on: boolean) =>
    setProdIds(prev => {
      const next = new Set(prev);
      shown.forEach(p => (on ? next.add(p.id) : next.delete(p.id)));
      return next;
    });

  const save = async () => {
    setSaving(true);
    try {
      await manageSupplierSupplies({ action: 'save', supplierId, productIds: Array.from(prodIds), categoryIds: Array.from(catIds) });
      toast.success('Saved');
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium text-foreground mb-1.5">Categories ({catIds.size})</p>
        <div className="max-h-36 overflow-y-auto rounded-md border border-border divide-y divide-border">
          {catOptions.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground text-center">No categories yet</p>
          ) : catOptions.map(c => (
            <label key={c.id} className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-muted/50">
              <Checkbox checked={catIds.has(c.id)} disabled={!canEdit} onCheckedChange={v => setCatIds(flip(catIds, c.id, !!v))} />
              <span className={c.depth ? 'pl-3' : 'font-medium'}>{c.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <p className="text-xs font-medium text-foreground">Products ({prodIds.size})</p>
          <div className="relative w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search products..." className="pl-8 h-8 text-xs" />
          </div>
        </div>
        <div className="rounded-md border border-border">
          <label className="flex items-center gap-2 px-3 py-1.5 border-b border-border text-xs text-muted-foreground cursor-pointer select-none">
            <Checkbox checked={allShownTicked} disabled={!canEdit || shown.length === 0} onCheckedChange={v => toggleAllShown(!!v)} />
            Select all ({shown.length})
          </label>
          <div className="max-h-64 overflow-y-auto">
            {shown.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground text-center">No products found</p>
            ) : shown.map(p => (
              <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 border-b border-border last:border-0 text-xs cursor-pointer hover:bg-muted/50">
                <Checkbox checked={prodIds.has(p.id)} disabled={!canEdit} onCheckedChange={v => setProdIds(flip(prodIds, p.id, !!v))} />
                <span className="flex-1 min-w-0">
                  <span className="block break-words whitespace-normal text-foreground">{p.productName}</span>
                  <span className="block text-[10px] text-muted-foreground font-mono break-all">{p.sku}</span>
                </span>
                {viaCategory(p) && <span className="shrink-0 text-[10px] text-sky-400">via category</span>}
              </label>
            ))}
          </div>
        </div>
      </div>

      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
        </div>
      )}
    </div>
  );
}
