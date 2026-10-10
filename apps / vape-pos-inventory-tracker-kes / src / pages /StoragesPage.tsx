import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getStorages, saveStorage, transferStock, getProducts, adjustStorageStock, importStorageStock } from 'zitejs/api';
import { Card, CardContent } from '@project/components/ui/card';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@project/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@project/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, ArrowRightLeft, ArrowLeft, Search, Eye, PackagePlus, CheckSquare, Download, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { usePermissions } from '../hooks/usePermissions';
import { OFFICE_ID, StockMap, StorageLite, qtyIn } from '../lib/storageMath';
import { downloadCsv } from '../lib/exportHelper';
import ProductMultiSearch from '../components/ProductMultiSearch';
import ImportDialog from '../components/ImportDialog';
import ViewToggle, { useViewMode } from '../components/ViewToggle';

interface Product { id: string; productName?: string; sku?: string; stockQuantity?: number; status?: string; }
interface Line { productId: string; quantity: string; }
type AdjMode = 'add' | 'set';
type BulkAction = 'add' | 'remove' | 'set' | 'clear';

const csvQ = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

export default function StoragesPage() {
  // canBackdate is true only for the Owner and Admins: the same people who may change stock levels.
  const { can, canBackdate } = usePermissions();
  const [viewMode, setViewMode] = useViewMode('storages', 'grid');
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
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);

  // Transfer
  const [transferOpen, setTransferOpen] = useState(false);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [transferring, setTransferring] = useState(false);

  // Add stock / set stock levels (Owner and Admins only)
  const [adjOpen, setAdjOpen] = useState(false);
  const [adjId, setAdjId] = useState('');
  const [adjMode, setAdjMode] = useState<AdjMode>('add');
  const [adjLines, setAdjLines] = useState<Line[]>([]);
  const [adjusting, setAdjusting] = useState(false);

  // Bulk actions on the rows ticked in the stock table (Owner and Admins only)
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState<BulkAction>('add');
  const [bulkQty, setBulkQty] = useState('');
  const [bulking, setBulking] = useState(false);

  // Import
  const [importOpen, setImportOpen] = useState(false);

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

  const openView = (id: string) => {
    setViewId(id); setViewSearch(''); setPicked(new Set());
    setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };
  const togglePick = (id: string) => setPicked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allPicked = viewRows.length > 0 && viewRows.every(r => picked.has(r.p.id));
  const toggleAllPicked = () => setPicked(allPicked ? new Set() : new Set(viewRows.map(r => r.p.id)));

  // ── Create / rename / delete ──
  const openName = (s?: StorageLite) => { setNameDialog({ id: s?.id }); setNameValue(s?.name || ''); };

  const handleSaveName = async () => {
    if (!nameValue.trim()) return toast.error('Storage name is required');
    setSavingName(true);
    try {
      await saveStorage(nameDialog?.id
        ? { action: 'rename', id: nameDialog.id, name: nameValue.trim() }
        : { action: 'create', name: nameValue.trim() });
      toast.success(nameDialog?.id ? 'Storage renamed' : 'Storage created');
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

  // ── Add stock / set stock levels (Owner and Admins) ──
  const openAdjust = (storageId?: string) => {
    setAdjId(storageId || viewId || OFFICE_ID);
    setAdjMode('add');
    setAdjLines([]);
    setAdjOpen(true);
  };

  const changeAdjStorage = (id: string) => { setAdjId(id); setAdjLines([]); };
  const changeAdjMode = (m: AdjMode) => { setAdjMode(m); setAdjLines([]); };

  // "Add" lines start at 1 (the amount to add); "Set" lines start at the current quantity in this storage.
  const addAdjLines = (list: Product[]) => {
    setAdjLines(prev => {
      const next = [...prev];
      for (const p of list) {
        if (!next.some(l => l.productId === p.id)) next.push({ productId: p.id, quantity: adjMode === 'add' ? '1' : String(qty(adjId, p)) });
      }
      return next;
    });
  };

  const handleAdjust = async () => {
    if (!adjId) return toast.error('Choose a storage');
    const items: { productId: string; quantity: number }[] = [];
    for (const l of adjLines) {
      if (l.quantity.trim() === '') continue;
      const q = Math.floor(Number(l.quantity));
      if (!Number.isFinite(q) || q < 0) return toast.error('Quantities must be 0 or more');
      const p = products.find(x => x.id === l.productId);
      const current = p ? qty(adjId, p) : 0;
      const target = adjMode === 'add' ? current + q : q;
      if (target === current) continue; // unchanged
      items.push({ productId: l.productId, quantity: target });
    }
    if (items.length === 0) return toast.error('Change at least one quantity');
    setAdjusting(true);
    try {
      const res = await adjustStorageStock({ storageId: adjId, items });
      toast.success(`Stock updated for ${res.adjusted} product${res.adjusted === 1 ? '' : 's'}`);
      setAdjOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Update failed');
    } finally {
      setAdjusting(false);
    }
  };

  // ── Bulk actions on ticked rows ──
  const handleBulk = async () => {
    if (!viewing || picked.size === 0) return;
    const n = Math.floor(Number(bulkQty));
    if (bulkAction !== 'clear' && (!Number.isFinite(n) || n < 0 || bulkQty.trim() === '')) return toast.error('Enter a quantity of 0 or more');
    const items: { productId: string; quantity: number }[] = [];
    for (const id of picked) {
      const p = products.find(x => x.id === id);
      if (!p) continue;
      const cur = qty(viewing.id, p);
      const target = bulkAction === 'add' ? cur + n : bulkAction === 'remove' ? Math.max(0, cur - n) : bulkAction === 'set' ? n : 0;
      if (target !== cur) items.push({ productId: id, quantity: target });
    }
    if (items.length === 0) return toast.error('Nothing would change');
    setBulking(true);
    try {
      const res = await adjustStorageStock({ storageId: viewing.id, items });
      toast.success(`Updated ${res.adjusted} product${res.adjusted === 1 ? '' : 's'}`);
      setBulkOpen(false);
      setBulkQty('');
      setPicked(new Set());
      load();
    } catch (e: any) {
      toast.error(e.message || 'Bulk update failed');
    } finally {
      setBulking(false);
    }
  };

  // ── Export / import (columns: Storage, SKU, Name, Quantity) ──
  const handleExport = (only?: StorageLite | null) => {
    const list = only ? [only] : storages;
    const out: string[] = [['Storage', 'SKU', 'Name', 'Quantity'].join(',')];
    for (const s of list) {
      for (const p of [...products].sort((a, b) => (a.productName || '').localeCompare(b.productName || ''))) {
        const n = qty(s.id, p);
        if (n > 0) out.push([s.name, p.sku, p.productName, n].map(csvQ).join(','));
      }
    }
    downloadCsv(out.join('\n') + '\n', only ? `stock_${only.name.replace(/\s+/g, '_')}.csv` : 'storage_stock_export.csv');
    toast.success('Exported');
  };

  const runImport = async (rows: Record<string, string>[]) => {
    const res = await importStorageStock({ rows });
    return { imported: res.imported, updated: res.updated, skipped: res.skipped, errors: res.errors };
  };

  const nameOf = (id: string) => storages.find(s => s.id === id)?.name || '';

  // Action icons of one storage (same in grid and list view)
  const storageActions = (s: StorageLite) => (
    <div className="flex items-center gap-0.5">
      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="View stock" onClick={() => openView(s.id)}><Eye className="w-3.5 h-3.5" /></Button>
      {can('inventory', 'edit') && (
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Transfer from here" onClick={() => openTransfer(s.id)}><ArrowRightLeft className="w-3.5 h-3.5" /></Button>
      )}
      {canBackdate && (
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-amber-400" title="Manage stock" onClick={() => openView(s.id)}><PackagePlus className="w-3.5 h-3.5" /></Button>
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
  );

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">Storages</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Button asChild variant="outline" size="sm"><Link to="/inventory"><ArrowLeft className="w-4 h-4 mr-1" /> Inventory</Link></Button>
          <ViewToggle value={viewMode} onChange={setViewMode} />
          {can('inventory', 'edit') && (
            <Button variant="outline" size="sm" onClick={() => openTransfer()}>
              <ArrowRightLeft className="w-4 h-4 mr-1" /> Transfer Stock
            </Button>
          )}
          {can('inventory', 'create') && <Button variant="outline" size="sm" onClick={() => openName()}><Plus className="w-4 h-4 mr-1" /> Add Storage</Button>}
          {can('inventory', 'export') && (
            <Button variant="outline" size="sm" className="border-pink-500 text-pink-400 hover:bg-pink-500/10" onClick={() => handleExport()}>
              <Download className="w-4 h-4 mr-1" /> Export
            </Button>
          )}
          {canBackdate && (
            <Button variant="outline" size="sm" className="border-green-500 text-green-400 hover:bg-green-500/10" onClick={() => setImportOpen(true)}>
              <Upload className="w-4 h-4 mr-1" /> Import
            </Button>
          )}
          {canBackdate && <Button size="sm" onClick={() => openAdjust()}><PackagePlus className="w-4 h-4 mr-1" /> Add Stock</Button>}
        </div>
      </div>

      {/* Storage tiles: same grid, card padding and layout as the tiles on Expenses > Deductions */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {loading ? (
            [...Array(4)].map((_, i) => <Card key={i} className="bg-card border-border"><CardContent className="p-4"><div className="h-24 bg-muted rounded animate-pulse" /></CardContent></Card>)
          ) : storages.map(s => {
            const t = totals.get(s.id) || { units: 0, products: 0 };
            return (
              <Card key={s.id} className={`bg-card ${viewId === s.id ? 'border-primary' : 'border-border'}`}>
                <CardContent className="p-4 space-y-3">
                  <p className="font-semibold text-foreground break-words whitespace-normal leading-snug">{s.name}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-md bg-primary/5 border border-primary/20 px-2 py-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Units</p>
                      <p className="font-semibold text-primary break-words">{t.units.toLocaleString()}</p>
                    </div>
                    <div className="rounded-md bg-pink-500/5 border border-pink-500/20 px-2 py-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Products</p>
                      <p className="font-semibold text-pink-500 break-words">{t.products.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="border-t border-border pt-2">{storageActions(s)}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="bg-card border-border"><CardContent className="p-0"><div className="overflow-auto max-h-[65vh]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card"><tr className="border-b border-border text-muted-foreground bg-card">
              <th className="text-left p-3 font-medium">Storage</th>
              <th className="text-right p-3 font-medium">Units</th>
              <th className="text-right p-3 font-medium">Products</th>
              <th className="p-3 w-44" />
            </tr></thead>
            <tbody>
              {loading ? (
                [...Array(4)].map((_, i) => <tr key={i} className="border-b border-border">{[...Array(4)].map((_, j) => <td key={j} className="p-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}</tr>)
              ) : storages.map(s => {
                const t = totals.get(s.id) || { units: 0, products: 0 };
                return (
                  <tr key={s.id} className={`border-b border-border hover:bg-muted/30 ${viewId === s.id ? 'bg-primary/5' : ''}`}>
                    <td className="p-3 font-medium text-foreground break-words whitespace-normal">{s.name}</td>
                    <td className="p-3 text-right font-semibold text-primary">{t.units.toLocaleString()}</td>
                    <td className="p-3 text-right font-semibold text-pink-500">{t.products.toLocaleString()}</td>
                    <td className="p-3">{storageActions(s)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div></CardContent></Card>
      )}

      {/* Stock held in the chosen storage, with its own Bulk Actions / Add / Import / Export buttons */}
      <div ref={panelRef}>
        {viewing && (
          <Card className="bg-card border-border">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="font-semibold text-foreground">Stock in {viewing.name}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input value={viewSearch} onChange={e => setViewSearch(e.target.value)} placeholder="Search products..." className="pl-8 h-8 text-xs w-56" />
                  </div>
                  {canBackdate && picked.size > 0 && (
                    <Button variant="outline" size="sm" onClick={() => { setBulkAction('add'); setBulkQty(''); setBulkOpen(true); }}>
                      <CheckSquare className="w-4 h-4 mr-1" /> Bulk Actions ({picked.size})
                    </Button>
                  )}
                  {can('inventory', 'export') && (
                    <Button variant="outline" size="sm" className="border-pink-500 text-pink-400 hover:bg-pink-500/10" onClick={() => handleExport(viewing)}>
                      <Download className="w-4 h-4 mr-1" /> Export
                    </Button>
                  )}
                  {canBackdate && (
                    <Button variant="outline" size="sm" className="border-green-500 text-green-400 hover:bg-green-500/10" onClick={() => setImportOpen(true)}>
                      <Upload className="w-4 h-4 mr-1" /> Import
                    </Button>
                  )}
                  {canBackdate && <Button size="sm" onClick={() => openAdjust(viewing.id)}><PackagePlus className="w-4 h-4 mr-1" /> Add</Button>}
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Close" onClick={() => setViewId(null)}><X className="w-4 h-4" /></Button>
                </div>
              </div>
              <div className="overflow-auto max-h-[50vh] rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border text-muted-foreground">
                      {canBackdate && (
                        <th className="p-3 w-8"><input type="checkbox" checked={allPicked} onChange={toggleAllPicked} className="rounded" /></th>
                      )}
                      <th className="text-left p-3 font-medium">SKU</th>
                      <th className="text-left p-3 font-medium">Name</th>
                      <th className="text-right p-3 font-medium">Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewRows.length === 0 ? (
                      <tr><td colSpan={canBackdate ? 4 : 3} className="text-center py-8 text-muted-foreground">No stock in this storage</td></tr>
                    ) : viewRows.map(({ p, n }) => (
                      <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                        {canBackdate && (
                          <td className="p-3"><input type="checkbox" checked={picked.has(p.id)} onChange={() => togglePick(p.id)} className="rounded" /></td>
                        )}
                        <td className="p-3 text-muted-foreground font-mono text-xs break-all">{p.sku}</td>
                        <td className="p-3 text-foreground break-words whitespace-normal">{p.productName}</td>
                        <td className="p-3 text-right font-semibold text-emerald-400">{n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create / rename */}
      <Dialog open={!!nameDialog} onOpenChange={o => { if (!o) setNameDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{nameDialog?.id ? 'Rename Storage' : 'Add Storage'}</DialogTitle>
          </DialogHeader>
          <div><Label>Name *</Label><Input value={nameValue} onChange={e => setNameValue(e.target.value)} placeholder="e.g. Westlands Shelf" /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNameDialog(null)}>Cancel</Button>
            <Button onClick={handleSaveName} disabled={savingName}>{savingName ? 'Saving...' : nameDialog?.id ? 'Rename' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer stock: clicking into the search box lists everything held in the origin storage */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ArrowRightLeft className="w-5 h-5 text-pink-400" /> Transfer Stock</DialogTitle>
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
                key={`${fromId}|${toId}`}
                items={sourceProducts}
                stockOf={p => (fromId ? qty(fromId, p) : 0)}
                destStockOf={toId ? (p => qty(toId, p)) : undefined}
                addedIds={lines.map(l => l.productId)}
                onAdd={addLines}
                disabled={!fromId}
                showOnFocus
                placeholder="Search products to move..."
              />
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

      {/* Add stock / set stock levels (Owner and Admins only; the server checks this too) */}
      {canBackdate && (
        <Dialog open={adjOpen} onOpenChange={setAdjOpen}>
          <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><PackagePlus className="w-5 h-5 text-amber-400" /> Add Stock</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 max-w-xl">
                <div>
                  <Label>Storage</Label>
                  <Select value={adjId} onValueChange={changeAdjStorage}>
                    <SelectTrigger><SelectValue placeholder="Select storage" /></SelectTrigger>
                    <SelectContent>{storages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Quantity entered is</Label>
                  <Select value={adjMode} onValueChange={v => changeAdjMode(v as AdjMode)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="add">Added to current stock</SelectItem>
                      <SelectItem value="set">The new stock level</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Products</Label>
                <ProductMultiSearch
                  key={`${adjId}|${adjMode}`}
                  items={products}
                  stockOf={p => (adjId ? qty(adjId, p) : 0)}
                  addedIds={adjLines.map(l => l.productId)}
                  onAdd={addAdjLines}
                  disabled={!adjId}
                  showOnFocus
                  placeholder="Search products..."
                />
              </div>

              {adjLines.length > 0 && (
                <div className="space-y-2">
                  {adjLines.map((l, i) => {
                    const p = products.find(x => x.id === l.productId);
                    const current = p ? qty(adjId, p) : 0;
                    return (
                      <div key={l.productId} className="flex items-center gap-3 bg-muted/50 rounded-lg p-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground break-words whitespace-normal">{p?.productName}</p>
                          <p className="text-xs text-muted-foreground">Now: {current}</p>
                        </div>
                        <Input
                          type="number"
                          min={0}
                          value={l.quantity}
                          onChange={e => setAdjLines(adjLines.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))}
                          className="w-24 h-8 text-center"
                        />
                        <button type="button" onClick={() => setAdjLines(adjLines.filter((_, j) => j !== i))}><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAdjOpen(false)}>Cancel</Button>
              <Button onClick={handleAdjust} disabled={adjusting || adjLines.length === 0}>{adjusting ? 'Saving...' : 'Save'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Bulk actions on the ticked rows of the stock table */}
      {canBackdate && (
        <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Bulk Actions ({picked.size} products in {viewing?.name})</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Action</Label>
                <Select value={bulkAction} onValueChange={v => setBulkAction(v as BulkAction)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="add">Add quantity</SelectItem>
                    <SelectItem value="remove">Remove quantity</SelectItem>
                    <SelectItem value="set">Set quantity</SelectItem>
                    <SelectItem value="clear">Clear stock (set to 0)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {bulkAction !== 'clear' && (
                <div><Label>Quantity</Label><Input type="number" min={0} value={bulkQty} onChange={e => setBulkQty(e.target.value)} /></div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancel</Button>
              <Button onClick={handleBulk} disabled={bulking}>{bulking ? 'Applying...' : 'Apply'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import Storage Stock"
        template="storageStock"
        chunkSize={100}
        description={<>CSV columns: <span className="font-medium text-foreground">Storage, SKU, Name, Quantity</span>.</>}
        onImport={runImport}
        onDone={load}
      />
    </div>
  );
}
