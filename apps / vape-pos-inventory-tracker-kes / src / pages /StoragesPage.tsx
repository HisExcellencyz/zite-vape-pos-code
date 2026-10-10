import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getStorages, saveStorage, transferStock, getProducts } from 'zitejs/api';
import { Card, CardContent } from '@project/components/ui/card';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Badge } from '@project/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@project/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@project/components/ui/alert-dialog';
import { Warehouse, Plus, Pencil, Trash2, ArrowRightLeft, ArrowLeft, Bike, Search, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { usePermissions } from '../hooks/usePermissions';
import { OFFICE_ID, StockMap, StorageLite, qtyIn } from '../lib/storageMath';
import ProductMultiSearch from '../components/ProductMultiSearch';

interface Product { id: string; productName?: string; sku?: string; stockQuantity?: number; status?: string; }
interface Line { productId: string; quantity: string; }

const typeLabel = (s: StorageLite) => (s.type === 'office' ? 'Default' : s.type === 'rider' ? 'Own rider' : 'Custom');

export default function StoragesPage() {
  const { can } = usePermissions();
  const [storages, setStorages] = useState<StorageLite[]>([]);
  const [stock, setStock] = useState<StockMap>({});
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Create / rename
  const [nameDialog, setNameDialog] = useState<{ id?: string } | null>(null);
  const [nameValue, setNameValue] = useState('');
  const [savingName, setSavingName] = useState(false);

  // View stock of one storage
  const [viewId, setViewId] = useState<string | null>(null);
  const [viewSearch, setViewSearch] = useState('');

  // Transfer
  const [transferOpen, setTransferOpen] = useState(false);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [transferring, setTransferring] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [s, p] = await Promise.all([getStorages({}), getProducts({})]);
      setStorages(s.storages as StorageLite[]);
      setStock((s.stock || {}) as StockMap);
      setProducts(p.products as Product[]);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load storages');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const qty = (storageId: string, p: Product) => qtyIn(storageId, p.id, p.stockQuantity || 0, stock);

  // Units and number of products held in each storage
  const totals = useMemo(() => {
    const out = new Map<string, { units: number; products: number }>();
    for (const s of storages) {
      let units = 0, count = 0;
      for (const p of products) {
        const n = qtyIn(s.id, p.id, p.stockQuantity || 0, stock);
        if (n > 0) { units += n; count++; }
      }
      out.set(s.id, { units, products: count });
    }
    return out;
  }, [storages, products, stock]);

  const viewing = storages.find(s => s.id === viewId) || null;
  const viewRows = viewing
    ? products
        .map(p => ({ p, n: qty(viewing.id, p) }))
        .filter(x => x.n > 0)
        .filter(x => {
          const q = viewSearch.trim().toLowerCase();
          return !q || (x.p.productName || '').toLowerCase().includes(q) || (x.p.sku || '').toLowerCase().includes(q);
        })
        .sort((a, b) => (a.p.productName || '').localeCompare(b.p.productName || ''))
    : [];

  // ── Create / rename / delete ──
  const openName = (s?: StorageLite) => { setNameDialog({ id: s?.id }); setNameValue(s?.name || ''); };

  const handleSaveName = async () => {
    if (!nameValue.trim()) return toast.error('Storage name is required');
    setSavingName(true);
    try {
      await saveStorage(nameDialog?.id
        ? { action: 'rename', id: nameDialog.id, name: nameValue.trim() }
        : { action: 'create', name: nameValue.trim() });
      toast.success(nameDialog?.id ? 'Storage renamed' : 'Storage created. It is also added under Addresses.');
      setNameDialog(null);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSavingName(false);
    }
  };

  const handleDelete = async (s: StorageLite) => {
    try {
      await saveStorage({ action: 'delete', id: s.id });
      toast.success('Storage deleted. Its stock returned to the Office.');
      if (viewId === s.id) setViewId(null);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete');
    }
  };

  // ── Transfer ──
  const openTransfer = (from?: string) => {
    setFromId(from || OFFICE_ID);
    setToId('');
    setLines([]);
    setTransferOpen(true);
  };

  const changeFrom = (id: string) => {
    setFromId(id);
    setLines([]);
    if (toId === id) setToId('');
  };

  // Adds every ticked product at once (products already in the transfer are skipped).
  const addLines = (list: Product[]) => {
    setLines(prev => {
      const next = [...prev];
      for (const p of list) if (!next.some(l => l.productId === p.id)) next.push({ productId: p.id, quantity: '1' });
      return next;
    });
  };

  // Only products the source storage actually holds can be transferred.
  const sourceProducts = products.filter(p => (fromId ? qty(fromId, p) > 0 : false));

  const handleTransfer = async () => {
    if (!fromId || !toId) return toast.error('Choose both storages');
    if (fromId === toId) return toast.error('Choose two different storages');
    const items = lines
      .map(l => ({ productId: l.productId, quantity: Math.floor(Number(l.quantity) || 0) }))
      .filter(l => l.quantity > 0);
    if (items.length === 0) return toast.error('Add at least one product with a quantity');
    for (const it of items) {
      const p = products.find(x => x.id === it.productId);
      if (p && it.quantity > qty(fromId, p)) return toast.error(`Only ${qty(fromId, p)} of ${p.productName} available`);
    }
    setTransferring(true);
    try {
      await transferStock({ fromId, toId, items });
      toast.success('Stock transferred');
      setTransferOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Transfer failed');
    } finally {
      setTransferring(false);
    }
  };

  const nameOf = (id: string) => storages.find(s => s.id === id)?.name || '';

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Storages</h1>
          <p className="text-sm text-muted-foreground">
            The Office is the default storage. Every Own Rider also has a storage of their own. Stock sold at POS comes out of the Office unless a rider's or a picked-up storage's stock is used.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button asChild variant="outline" size="sm"><Link to="/inventory"><ArrowLeft className="w-4 h-4 mr-1" /> Inventory</Link></Button>
          {can('inventory', 'edit') && (
            <Button variant="outline" size="sm" className="border-pink-500 text-pink-400 hover:bg-pink-500/10" onClick={() => openTransfer()}>
              <ArrowRightLeft className="w-4 h-4 mr-1" /> Transfer Stock
            </Button>
          )}
          {can('inventory', 'create') && <Button size="sm" onClick={() => openName()}><Plus className="w-4 h-4 mr-1" /> Add Storage</Button>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {loading ? (
          [...Array(3)].map((_, i) => <Card key={i} className="bg-card border-border"><CardContent className="p-4"><div className="h-24 bg-muted rounded animate-pulse" /></CardContent></Card>)
        ) : storages.map(s => {
          const t = totals.get(s.id) || { units: 0, products: 0 };
          return (
            <Card key={s.id} className={`bg-card ${viewId === s.id ? 'border-primary' : 'border-border'}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    {s.type === 'rider' ? <Bike className="w-5 h-5 text-sky-400 shrink-0" /> : <Warehouse className="w-5 h-5 text-amber-400 shrink-0" />}
                    <p className="font-semibold text-foreground break-words whitespace-normal leading-snug">{s.name}</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">{typeLabel(s)}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md bg-primary/5 border border-primary/20 px-2 py-1.5">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Units</p>
                    <p className="font-semibold text-primary">{t.units.toLocaleString()}</p>
                  </div>
                  <div className="rounded-md bg-pink-500/5 border border-pink-500/20 px-2 py-1.5">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Products</p>
                    <p className="font-semibold text-pink-500">{t.products.toLocaleString()}</p>
                  </div>
                </div>
                <div className="border-t border-border pt-2 flex items-center gap-1 flex-wrap">
                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => { setViewId(s.id); setViewSearch(''); }}><Eye className="w-3.5 h-3.5 mr-1" /> Stock</Button>
                  {can('inventory', 'edit') && (
                    <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => openTransfer(s.id)}><ArrowRightLeft className="w-3.5 h-3.5 mr-1" /> Transfer</Button>
                  )}
                  <div className="ml-auto flex">
                    {can('inventory', 'edit') && s.type !== 'rider' && (
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Rename" onClick={() => openName(s)}><Pencil className="w-3.5 h-3.5" /></Button>
                    )}
                    {can('inventory', 'delete') && s.type === 'custom' && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button></AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete {s.name}?</AlertDialogTitle>
                            <AlertDialogDescription>Its stock goes back to the Office and its location under Addresses is removed.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(s)} className="bg-destructive">Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
                {s.type === 'rider' && <p className="text-[10px] text-muted-foreground">Created automatically for this Own Rider (renamed or removed with the rider in Settings &gt; Delivery). Not shown under Addresses.</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Stock held in the chosen storage */}
      {viewing && (
        <Card className="bg-card border-border">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="font-semibold text-foreground">Stock in {viewing.name}</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input value={viewSearch} onChange={e => setViewSearch(e.target.value)} placeholder="Search products..." className="pl-8 h-8 text-xs w-64" />
              </div>
            </div>
            <div className="overflow-auto max-h-[50vh] rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left p-3 font-medium">Product</th>
                    <th className="text-left p-3 font-medium">SKU</th>
                    <th className="text-right p-3 font-medium">Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {viewRows.length === 0 ? (
                    <tr><td colSpan={3} className="text-center py-8 text-muted-foreground">No stock in this storage</td></tr>
                  ) : viewRows.map(({ p, n }) => (
                    <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="p-3 text-foreground break-words whitespace-normal">{p.productName}</td>
                      <td className="p-3 text-muted-foreground font-mono text-xs break-all">{p.sku}</td>
                      <td className="p-3 text-right font-semibold text-emerald-400">{n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create / rename */}
      <Dialog open={!!nameDialog} onOpenChange={o => { if (!o) setNameDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{nameDialog?.id ? 'Rename Storage' : 'Add Storage'}</DialogTitle>
            <DialogDescription className="text-xs">
              {nameDialog?.id
                ? "Only the storage is renamed. Its location under Addresses keeps its own name."
                : 'A matching Storage-type location is added under Addresses automatically.'}
            </DialogDescription>
          </DialogHeader>
          <div><Label>Name *</Label><Input value={nameValue} onChange={e => setNameValue(e.target.value)} placeholder="e.g. Westlands Shelf" /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNameDialog(null)}>Cancel</Button>
            <Button onClick={handleSaveName} disabled={savingName}>{savingName ? 'Saving...' : nameDialog?.id ? 'Rename' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer stock: wide enough to show about ten search results at once */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ArrowRightLeft className="w-5 h-5 text-pink-400" /> Transfer Stock</DialogTitle>
            <DialogDescription className="text-xs">Moves stock from one storage to another. Total stock does not change.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>From</Label>
                <Select value={fromId} onValueChange={changeFrom}>
                  <SelectTrigger><SelectValue placeholder="Select storage" /></SelectTrigger>
                  <SelectContent>{storages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>To</Label>
                <Select value={toId} onValueChange={setToId}>
                  <SelectTrigger><SelectValue placeholder="Select storage" /></SelectTrigger>
                  <SelectContent>{storages.filter(s => s.id !== fromId).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Products in {nameOf(fromId) || 'the source storage'}</Label>
              <ProductMultiSearch
                items={sourceProducts}
                stockOf={p => (fromId ? qty(fromId, p) : 0)}
                addedIds={lines.map(l => l.productId)}
                onAdd={addLines}
                disabled={!fromId}
                placeholder="Search products to move..."
              />
              <p className="text-[11px] text-muted-foreground">"In stock" shows the quantity held in {nameOf(fromId) || 'the source storage'}.</p>
            </div>

            {lines.length > 0 && (
              <div className="space-y-2">
                {lines.map((l, i) => {
                  const p = products.find(x => x.id === l.productId);
                  const avail = p ? qty(fromId, p) : 0;
                  return (
                    <div key={l.productId} className="flex items-center gap-3 bg-muted/50 rounded-lg p-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground break-words whitespace-normal">{p?.productName}</p>
                        <p className="text-xs text-muted-foreground">{avail} available</p>
                      </div>
                      <Input
                        type="number"
                        min={1}
                        max={avail}
                        value={l.quantity}
                        onChange={e => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))}
                        className="w-20 h-8 text-center"
                      />
                      <button type="button" onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>Cancel</Button>
            <Button onClick={handleTransfer} disabled={transferring || lines.length === 0 || !toId}>{transferring ? 'Transferring...' : 'Transfer'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
