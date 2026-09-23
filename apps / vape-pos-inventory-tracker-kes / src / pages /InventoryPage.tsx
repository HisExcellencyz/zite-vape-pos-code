import { useState, useEffect, useRef } from 'react';
import { getProducts, getCategories, saveProduct, deleteRecord, exportCsv, importCsv, bulkUpdateProducts, bulkDeleteRecords, uploadProductImage } from 'zitejs/api';
import { Card, CardContent } from '@project/components/ui/card';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Badge } from '@project/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@project/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@project/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Search, Plus, Download, Upload, Package, Pencil, Trash2, CheckSquare, ImagePlus } from 'lucide-react';
import { toast } from 'sonner';
import { downloadCsv } from '../lib/exportHelper';
import ViewToggle, { useViewMode } from '../components/ViewToggle';
import ImportDialog from '../components/ImportDialog';
import ProductImage, { compressImage } from '../components/ProductImage';

interface Product {
  id: string;
  productName?: string;
  sku?: string;
  costPrice?: number;
  sellingPrice?: number;
  stockQuantity?: number;
  status?: string;
  category?: string | string[];
  images?: { url: string }[];
}

interface Category {
  id: string;
  categoryName?: string;
}

const photoOf = (p: Product) => p.images?.[0]?.url;

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [viewMode, setViewMode] = useViewMode('inventory', 'list');
  const [importOpen, setImportOpen] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formSku, setFormSku] = useState('');
  const [formCost, setFormCost] = useState('');
  const [formSelling, setFormSelling] = useState('');
  const [formStock, setFormStock] = useState('0');
  const [formCategory, setFormCategory] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null); // what the form currently shows
  const [photoData, setPhotoData] = useState<string | null>(null); // new upload (compressed data URL)
  const [photoName, setPhotoName] = useState('');
  const [removePhoto, setRemovePhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulk, setShowBulk] = useState(false);
  const [bulkAction, setBulkAction] = useState('');
  const [bulkStock, setBulkStock] = useState('');
  const [bulkCost, setBulkCost] = useState('');
  const [bulkSelling, setBulkSelling] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [prods, cats] = await Promise.all([
        getProducts({ search, status: statusFilter && statusFilter !== 'all' ? statusFilter : undefined }),
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

  const resetPhoto = (existing?: string | null) => {
    setPhotoPreview(existing || null);
    setPhotoData(null);
    setPhotoName('');
    setRemovePhoto(false);
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setFormName(p.productName || '');
    setFormSku(p.sku || '');
    setFormCost(String(p.costPrice || 0));
    setFormSelling(String(p.sellingPrice || 0));
    setFormStock(String(p.stockQuantity || 0));
    setFormCategory((Array.isArray(p.category) ? p.category[0] : p.category) || '');
    setFormDescription('');
    resetPhoto(photoOf(p));
    setShowForm(true);
  };

  const openNew = () => {
    setEditing(null);
    setFormName(''); setFormSku(''); setFormCost(''); setFormSelling(''); setFormStock('0'); setFormDescription(''); setFormCategory('');
    resetPhoto(null);
    setShowForm(true);
  };

  const handlePhotoChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Please choose an image file');
    if (file.size > 15 * 1024 * 1024) return toast.error('Image is too large (max 15 MB)');
    try {
      const data = await compressImage(file);
      setPhotoData(data);
      setPhotoPreview(data);
      setPhotoName(file.name);
      setRemovePhoto(false);
    } catch (err: any) {
      toast.error(err.message || 'Could not process image');
    }
  };

  const handleRemovePhoto = () => {
    setPhotoData(null);
    setPhotoPreview(null);
    setPhotoName('');
    setRemovePhoto(true);
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  const handleSave = async () => {
    if (!formName || !formSku || !formCost || !formSelling) {
      toast.error('Product name, SKU, cost price, and selling price are required');
      return;
    }
    setSaving(true);
    try {
      const res: any = await saveProduct({
        id: editing?.id,
        productName: formName,
        sku: formSku,
        costPrice: Number(formCost),
        sellingPrice: Number(formSelling),
        stockQuantity: Number(formStock),
        category: formCategory || undefined,
        description: formDescription || undefined,
      });
      const productId = editing?.id || res?.product?.id;

      if (productId && (photoData || (removePhoto && editing && photoOf(editing)))) {
        try {
          await uploadProductImage(
            photoData
              ? { productId, dataUrl: photoData, filename: photoName || `${formSku}.jpg` }
              : { productId, remove: true },
          );
        } catch (err: any) {
          toast.warning(`Product saved, but the photo failed: ${err.message || 'upload error'}`);
        }
      }

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

  const runImport = async (rows: Record<string, string>[]) => {
    const res = await importCsv({ table: 'products', rows });
    return { imported: res.imported, updated: res.updated, errors: res.errors };
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
    setSelectedIds(selectedIds.size === products.length ? new Set() : new Set(products.map(p => p.id)));
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
          <Button variant="outline" size="sm" className="border-green-500 text-green-400 hover:bg-green-500/10" onClick={() => setImportOpen(true)}><Upload className="w-4 h-4 mr-1" /> Import</Button>
          <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Add Product</Button>
        </div>
      </div>

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
                        <td className="p-3 font-medium text-foreground max-w-xs">
                          <div className="flex items-center gap-3">
                            <ProductImage src={photoOf(p)} alt={p.productName} className="w-10 h-10" />
                            <span className="break-words whitespace-normal min-w-0">{p.productName}</span>
                          </div>
                        </td>
                        <td className="p-3 text-muted-foreground font-mono text-xs break-all">{p.sku}</td>
                        <td className="p-3 text-right text-muted-foreground whitespace-nowrap">{fmt(p.costPrice)}</td>
                        <td className="p-3 text-right text-foreground whitespace-nowrap">{fmt(p.sellingPrice)}</td>
                        <td className="p-3 text-right">
                          <span className={p.stockQuantity && p.stockQuantity > 0 ? 'text-emerald-400' : 'text-red-400'}>{p.stockQuantity || 0}</span>
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 items-stretch">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <Card key={i} className="bg-card border-border"><CardContent className="p-4"><div className="aspect-square bg-muted rounded animate-pulse" /></CardContent></Card>
              ))
            ) : products.length === 0 ? (
              <Card className="col-span-full bg-card border-border">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  No products found
                </CardContent>
              </Card>
            ) : products.map(p => (
              <Card key={p.id} className={`bg-card flex flex-col ${selectedIds.has(p.id) ? 'border-primary' : 'border-border'}`}>
                <CardContent className="p-3 space-y-3 flex flex-col flex-1">
                  <div className="relative">
                    <ProductImage src={photoOf(p)} alt={p.productName} className="w-full" />
                    <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} className="absolute top-2 left-2 rounded" />
                    <div className="absolute top-2 right-2">{statusBadge(p)}</div>
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground break-words whitespace-normal leading-snug [overflow-wrap:anywhere]">{p.productName}</p>
                    <p className="text-xs text-muted-foreground font-mono break-all mt-0.5">{p.sku}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs mt-auto">
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

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import Products"
        template="products"
        chunkSize={100}
        description={<>Upload a CSV with columns: <span className="font-medium text-foreground">Product Name, SKU, Cost Price, Selling Price, Stock Quantity, Category (optional)</span>. Products matched by SKU are updated. Unknown categories are created automatically. Press OK to start the import. (In Excel: File → Save As → CSV.)</>}
        onImport={runImport}
        onDone={load}
      />

      {/* Product Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Product' : 'New Product'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Photo */}
            <div className="flex items-center gap-4">
              <ProductImage src={photoPreview} alt="Product photo" className="w-24 h-24" />
              <div className="space-y-2">
                <Label className="block">Product photo</Label>
                <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChosen} />
                <div className="flex gap-2 flex-wrap">
                  <Button type="button" variant="outline" size="sm" onClick={() => photoInputRef.current?.click()}>
                    <ImagePlus className="w-4 h-4 mr-1" /> {photoPreview ? 'Change' : 'Upload'}
                  </Button>
                  {photoPreview && (
                    <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={handleRemovePhoto}>
                      <Trash2 className="w-4 h-4 mr-1" /> Remove
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">Photos are cropped to a square so every product looks the same.</p>
              </div>
            </div>

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
                    {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.categoryName}</SelectItem>)}
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
                  <SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.categoryName}</SelectItem>)}</SelectContent>
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
                <AlertDialogTrigger asChild><Button variant="destructive">Delete</Button></AlertDialogTrigger>
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
