import { useState, useEffect, useMemo, useRef } from 'react';
import { getProducts, getCategories, saveProduct, deleteRecord, exportCsv, importCsv, bulkUpdateProducts, bulkDeleteRecords } from 'zitejs/api';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Badge } from '@project/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@project/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@project/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Search, Plus, Download, Upload, Package, Pencil, Trash2, CheckSquare, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { downloadCsv, parseCsv, downloadTemplate } from '../lib/exportHelper';
import ViewToggle, { useViewMode } from '../components/ViewToggle';

interface Product {
  id: string;
  productName?: string;
  sku?: string;
  costPrice?: number;
  sellingPrice?: number;
  stockQuantity?: number;
  status?: string;
  category?: string | string[];
}

interface Category {
  id: string;
  categoryName?: string;
}

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [viewMode, setViewMode] = useViewMode('inventory', 'list');

  // Form state
  const [formName, setFormName] = useState('');
  const [formSku, setFormSku] = useState('');
  const [formCost, setFormCost] = useState('');
  const [formSelling, setFormSelling] = useState('');
  const [formStock, setFormStock] = useState('0');
  const [formCategory, setFormCategory] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulk, setShowBulk] = useState(false);
  const [bulkAction, setBulkAction] = useState('');
  const [bulkStock, setBulkStock] = useState('');
  const [bulkCost, setBulkCost] = useState('');
  const [bulkSelling, setBulkSelling] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [prods, cats] = await Promise.all([
        getProducts({ search, status: statusFilter || undefined }),
        getCategories({}),
      ]);
      setProducts(prods.products as Product[]);
      setCategories(cats.categories as Category[]);
    } catch {
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [search, statusFilter]);

  const openEdit = (p: Product) => {
    setEditing(p);
    setFormName(p.productName || '');
    setFormSku(p.sku || '');
    setFormCost(String(p.costPrice || 0));
    setFormSelling(String(p.sellingPrice || 0));
    setFormStock(String(p.stockQuantity || 0));
    setFormDescription('');
    setShowForm(true);
  };

  const openNew = () => {
    setEditing(null);
    setFormName(''); setFormSku(''); setFormCost(''); setFormSelling(''); setFormStock('0'); setFormDescription(''); setFormCategory('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formName || !formSku || !formCost || !formSelling) {
      toast.error('Product name, SKU, cost price, and selling price are required');
      return;
    }
    setSaving(true);
    try {
      await saveProduct({
        id: editing?.id,
        productName: formName,
        sku: formSku,
        costPrice: Number(formCost),
        sellingPrice: Number(formSelling),
        stockQuantity: Number(formStock),
        category: formCategory || undefined,
        description: formDescription || undefined,
      });
      toast.success(editing ? 'Product updated' : 'Product created');
      setShowForm(false);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRecord({ table: 'products', id });
      toast.success('Product deleted');
      load();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const handleExport = async () => {
    try {
      const res = await exportCsv({ table: 'products' });
      downloadCsv(res.csv, res.filename);
      toast.success('Exported');
    } catch { toast.error('Export failed'); }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) return toast.error('No data found in file');
    try {
      const res = await importCsv({ table: 'products', rows });
      toast.success(`Imported ${res.imported}, Updated ${res.updated}${res.errors.length ? `, ${res.errors.length} errors` : ''}`);
      load();
    } catch (err: any) { toast.error(err.message || 'Import failed'); }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleBulkAction = async () => {
    if (selectedIds.size === 0) return toast.error('Select products first');
    if (!bulkAction) return toast.error('Select an action');
    if (bulkAction === 'assignCategory' && !bulkCategory) return toast.error('Select a category');
    try {
      if (bulkAction === 'delete') {
        const res = await bulkDeleteRecords({ table: 'products', ids: Array.from(selectedIds) });
        toast.success(`Deleted ${res.deleted} products`);
      } else {
        await bulkUpdateProducts({
          productIds: Array.from(selectedIds),
          action: bulkAction as any,
          stockQuantity: bulkAction === 'updateStock' ? Number(bulkStock) : undefined,
          costPrice: bulkAction === 'updatePrices' ? Number(bulkCost) || undefined : undefined,
          sellingPrice: bulkAction === 'updatePrices' ? Number(bulkSelling) || undefined : undefined,
          categoryId: bulkAction === 'assignCategory' ? bulkCategory : undefined,
        });
        toast.success(`Updated ${selectedIds.size} products`);
      }
      setSelectedIds(new Set());
      setShowBulk(false);
      setBulkAction('');
      setBulkCategory('');
      load();
    } catch (err: any) { toast.error(err.message || 'Failed'); }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const toggleAll = () => {
    if (selectedIds.size === products.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(products.map(p => p.id)));
    }
  };

  const fmt = (n?: number) => n != null ? `KES ${n.toLocaleString()}` : 'KES 0';

  const renderActions = (p: Product) => (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" onClick={() => openEdit(p)}><Pencil className="w-3.5 h-3.5" /></Button>
      <AlertDialog>
        <AlertDialogTrigger asChild><Button variant="ghost" size="sm" className="text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button></AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete {p.productName}.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleDelete(p.id)} className="bg-destructive">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  const statusBadge = (p: Product) => (
    <Badge variant={p.status === 'Active' ? 'default' : 'secondary'} className={p.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}>
      {p.status}
    </Badge>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inventory</h1>
          <p className="text-sm text-muted-foreground">{products.length} products</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ViewToggle value={viewMode} onChange={setViewMode} />
          {selectedIds.size > 0 && (
            <Button variant="outline" size="sm" onClick={() => setShowBulk(true)}>
              <CheckSquare className="w-4 h-4 mr-1" /> Bulk Actions ({selectedIds.size})
            </Button>
          )}
          <Button variant="outline" size="sm" className="border-pink-500 text-pink-400 hover:bg-pink-500/10" onClick={handleExport}><Download className="w-4 h-4 mr-1" /> Export</Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="border-green-500 text-green-400 hover:bg-green-500/10"><Upload className="w-4 h-4 mr-1" /> Import</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>Import Products</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Upload a CSV file with columns: <span className="font-medium text-foreground">Product Name, SKU, Cost Price, Selling Price, Stock Quantity, Category (optional)</span>. Existing products matched by SKU will be updated. If a Category name doesn't exist yet, it will be created automatically.</p>
                <Button variant="outline" size="sm" className="border-yellow-500 text-yellow-400 hover:bg-yellow-500/10" onClick={() => downloadTemplate('products')}><FileDown className="w-4 h-4 mr-1" /> Download Template</Button>
                <div>
                  <Label className="text-sm mb-1 block">Select CSV file</Label>
                  <Input ref={fileInputRef} type="file" accept=".csv,.txt" onChange={handleImport} />
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Add Product</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Products */}
      {viewMode === 'list' ? (
        <Card className="bg-card border-border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="p-3 w-8"><input type="checkbox" checked={selectedIds.size === products.length && products.length > 0} onChange={toggleAll} className="rounded" /></th>
                    <th className="text-left p-3 font-medium">Product</th>
                    <th className="text-left p-3 font-medium">SKU</th>
                    <th className="text-right p-3 font-medium">Cost</th>
                    <th className="text-right p-3 font-medium">Selling</th>
                    <th className="text-right p-3 font-medium">Stock</th>
                    <th className="text-center p-3 font-medium">Status</th>
                    <th className="text-right p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [...Array(5)].map((_, i) => (
                      <tr key={i} className="border-b border-border">
                        <td className="p-3"></td>
                        {[...Array(7)].map((_, j) => <td key={j} className="p-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}
                      </tr>
                    ))
                  ) : products.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-muted-foreground">
                        <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
                        No products found
                      </td>
                    </tr>
                  ) : (
                    products.map(p => (
                      <tr key={p.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                        <td className="p-3"><input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} className="rounded" /></td>
                        <td className="p-3 font-medium text-foreground break-words whitespace-normal max-w-xs">{p.productName}</td>
                        <td className="p-3 text-muted-foreground font-mono text-xs break-all">{p.sku}</td>
                        <td className="p-3 text-right text-muted-foreground whitespace-nowrap">{fmt(p.costPrice)}</td>
                        <td className="p-3 text-right text-foreground whitespace-nowrap">{fmt(p.sellingPrice)}</td>
                        <td className="p-3 text-right">
                          <span className={p.stockQuantity && p.stockQuantity > 0 ? 'text-emerald-400' : 'text-red-400'}>
                            {p.stockQuantity || 0}
                          </span>
                        </td>
                        <td className="p-3 text-center">{statusBadge(p)}</td>
                        <td className="p-3 text-right">{renderActions(p)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {products.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground select-none w-fit cursor-pointer">
              <input type="checkbox" checked={selectedIds.size === products.length} onChange={toggleAll} className="rounded" />
              Select all
            </label>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {loading ? (
              [...Array(4)].map((_, i) => (
                <Card key={i} className="bg-card border-border"><CardContent className="p-4"><div className="h-28 bg-muted rounded animate-pulse" /></CardContent></Card>
              ))
            ) : products.length === 0 ? (
              <Card className="col-span-full bg-card border-border">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  No products found
                </CardContent>
              </Card>
            ) : products.map(p => (
              <Card key={p.id} className={`bg-card ${selectedIds.has(p.id) ? 'border-primary' : 'border-border'}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} className="mt-1 rounded shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground break-words whitespace-normal leading-snug">{p.productName}</p>
                      <p className="text-xs text-muted-foreground font-mono break-all mt-0.5">{p.sku}</p>
                    </div>
                    <div className="shrink-0">{statusBadge(p)}</div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="text-muted-foreground">Cost</p>
                      <p className="font-medium text-foreground break-words">{fmt(p.costPrice)}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-muted-foreground">Selling</p>
                      <p className="font-semibold text-primary break-words">{fmt(p.sellingPrice)}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-muted-foreground">Stock</p>
                      <p className={`font-semibold ${p.stockQuantity && p.stockQuantity > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{p.stockQuantity || 0}</p>
                    </div>
                  </div>
                  <div className="border-t border-border pt-2">{renderActions(p)}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Product Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Product' : 'New Product'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Product Name *</Label>
                <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. IGET Bar 3500" />
              </div>
              <div>
                <Label>SKU *</Label>
                <Input value={formSku} onChange={e => setFormSku(e.target.value)} placeholder="e.g. IGET-3500-MAN" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Cost Price (KES) *</Label>
                <Input type="number" value={formCost} onChange={e => setFormCost(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <Label>Selling Price (KES) *</Label>
                <Input type="number" value={formSelling} onChange={e => setFormSelling(e.target.value)} placeholder="0.00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Stock Quantity</Label>
                <Input type="number" value={formStock} onChange={e => setFormStock(e.target.value)} />
              </div>
              <div>
                <Label>Category</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.categoryName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {(Number(formCost) === 0 || Number(formSelling) === 0) && formCost !== '' && formSelling !== '' && (
              <p className="text-xs text-amber-400">⚠ Products with 0 cost or selling price will be set as Inactive.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Actions Dialog */}
      <Dialog open={showBulk} onOpenChange={setShowBulk}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Bulk Actions ({selectedIds.size} products)</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Action</Label>
              <Select value={bulkAction} onValueChange={setBulkAction}>
                <SelectTrigger><SelectValue placeholder="Select action" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="activate">Set Active</SelectItem>
                  <SelectItem value="deactivate">Set Inactive</SelectItem>
                  <SelectItem value="updateStock">Update Stock</SelectItem>
                  <SelectItem value="updatePrices">Update Prices</SelectItem>
                  <SelectItem value="assignCategory">Assign Category</SelectItem>
                  <SelectItem value="delete">Delete Selected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {bulkAction === 'updateStock' && (
              <div><Label>New Stock Quantity</Label><Input type="number" value={bulkStock} onChange={e => setBulkStock(e.target.value)} /></div>
            )}
            {bulkAction === 'updatePrices' && (
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Cost Price</Label><Input type="number" value={bulkCost} onChange={e => setBulkCost(e.target.value)} placeholder="Leave empty to skip" /></div>
                <div><Label>Selling Price</Label><Input type="number" value={bulkSelling} onChange={e => setBulkSelling(e.target.value)} placeholder="Leave empty to skip" /></div>
              </div>
            )}
            {bulkAction === 'assignCategory' && (
              <div>
                <Label>Category</Label>
                <Select value={bulkCategory} onValueChange={setBulkCategory}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.categoryName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {bulkAction === 'delete' && (
              <p className="text-xs text-destructive">⚠ This will permanently delete {selectedIds.size} product(s). This cannot be undone.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulk(false)}>Cancel</Button>
            {bulkAction === 'delete' ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">Delete</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {selectedIds.size} products?</AlertDialogTitle>
                    <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleBulkAction} className="bg-destructive">Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <Button onClick={handleBulkAction}>Apply</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
