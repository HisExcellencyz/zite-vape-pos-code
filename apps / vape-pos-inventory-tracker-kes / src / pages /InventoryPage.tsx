import { useState, useEffect } from 'react';
import { useBranch } from '../hooks/useBranch';
import { getProducts, getCategories, saveProduct, deleteRecord, exportCsv, importCsv, bulkUpdateProducts, bulkDeleteRecords, uploadProductImage } from 'zitejs/api';
import { Card, CardContent } from '@project/components/ui/card';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Badge } from '@project/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@project/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@project/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Search, Plus, Download, Upload, Package, Pencil, Trash2, CheckSquare, ArrowUp, ArrowDown, FolderTree } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { downloadCsv } from '../lib/exportHelper';
import { normalizeImageUrl, isDirectImageUrl, isHttpUrl } from '../lib/imageUrl';
import ViewToggle, { useViewMode } from '../components/ViewToggle';
import ImportDialog from '../components/ImportDialog';
import ProductImage from '../components/ProductImage';
import { getInventoryValuation, GetInventoryValuationOutputType } from 'zitejs/api';
import { useTableControls, TableControls, SortTh, FieldDef } from '../components/TableControls';
import DateRangeFilter, { Range, eatBounds } from '../components/DateRangeFilter';
import SummaryTiles from '../components/SummaryTiles';
import CategoryRibbon, { CategoryLite, flattenCategories, matchesCategory, productCategoryId } from '../components/CategoryRibbon';
import { usePermissions } from '../hooks/usePermissions';

interface Product {
  id: string;
  productName?: string;
  sku?: string;
  costPrice?: number;
  sellingPrice?: number;
  stockQuantity?: number;
  status?: string;
  reorderLevel?: number;
  category?: string | string[];
  images?: { url: string }[];
}

type Category = CategoryLite;

type SortBy = 'name' | 'stock' | 'price' | 'value';
type SortDir = 'asc' | 'desc';

const SORT_LABELS: Record<SortBy, string> = {
  name: 'Name',
  stock: 'Stock',
  price: 'Selling Price',
  value: 'Stock Value',
};

const photoOf = (p: Product) => p.images?.[0]?.url;

const FIELDS: FieldDef<any>[] = [
  { key: 'productName', label: 'Product' }, { key: 'sku', label: 'SKU' }, { key: 'costPrice', label: 'Cost' },
  { key: 'sellingPrice', label: 'Selling' }, { key: 'stockQuantity', label: 'Stock' }, { key: 'reorderLevel', label: 'Reorder Level' },
  { key: 'status', label: 'Status' }, { key: 'description', label: 'Description' },
];

export default function InventoryPage() {
  const { can } = usePermissions();
  const { currentBranch } = useBranch();
  const [range, setRange] = useState<Range>({});
  const [valuation, setValuation] = useState<GetInventoryValuationOutputType | null>(null);
  useEffect(() => {
    const b = eatBounds(range);
    getInventoryValuation({
      branchId: currentBranch?.id,
      start: range.start ? new Date(b.from - 1).toISOString() : undefined,
      end: range.end ? new Date(b.to).toISOString() : undefined,
    }).then(setValuation).catch(() => setValuation(null));
  }, [range.start?.getTime(), range.end?.getTime(), currentBranch?.id]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
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
  const [formImageUrl, setFormImageUrl] = useState(''); // photo link, entered or edited by hand
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
        getProducts({
          branchId: currentBranch?.id,
          search,
          status: statusFilter && statusFilter !== 'all' ? statusFilter : undefined,
          sortBy,
          sortDir,
        }),
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

  useEffect(() => { load(); }, [search, statusFilter, sortBy, sortDir, currentBranch?.id]);

  const openEdit = (p: Product) => {
    setEditing(p);
    setFormName(p.productName || '');
    setFormSku(p.sku || '');
    setFormCost(String(p.costPrice || 0));
    setFormSelling(String(p.sellingPrice || 0));
    setFormStock(String(p.stockQuantity || 0));
    setFormCategory((Array.isArray(p.category) ? p.category[0] : p.category) || '');
    setFormDescription('');
    setFormImageUrl(photoOf(p) || '');
    setShowForm(true);
  };

  const openNew = () => {
    setEditing(null);
    setFormName(''); setFormSku(''); setFormCost(''); setFormSelling(''); setFormStock('0'); setFormDescription(''); setFormCategory('');
    setFormImageUrl('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formName || !formSku || !formCost || !formSelling) {
      toast.error('Product name, SKU, cost price, and selling price are required');
      return;
    }
    setSaving(true);
    try {
      const res: any = await saveProduct({
        branchId: currentBranch?.id,
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

      const originalUrl = editing ? (photoOf(editing) || '') : '';
      const newUrl = formImageUrl.trim();

      if (productId && newUrl !== originalUrl) {
        try {
          if (newUrl) {
            const normalized = normalizeImageUrl(newUrl);
            if (!isHttpUrl(normalized)) {
              toast.warning('Product saved, but the photo link must start with http:// or https:// — photo not updated.');
            } else {
              await uploadProductImage({ productId, imageUrl: normalized, filename: `${formSku}.jpg` });
            }
          } else {
            await uploadProductImage({ productId, remove: true });
          }
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

  // Products in the category chosen on the ribbon (a category includes its sub-categories).
  const shown = products.filter(p => matchesCategory(categoryFilter, productCategoryId(p), categories));
  const categoryOptions = flattenCategories(categories);

  const toggleAll = () => {
    setSelectedIds(selectedIds.size === shown.length ? new Set() : new Set(shown.map(p => p.id)));
  };

  const tc = useTableControls(shown, FIELDS);
  const fmt = (n?: number) => n != null ? `KES ${n.toLocaleString()}` : 'KES 0';

  const toggleSortDir = () => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));

  const renderActions = (p: Product) => (
    <div className="flex justify-end gap-1">
      {can('inventory', 'edit') && <Button variant="ghost" size="sm" onClick={() => openEdit(p)}><Pencil className="w-3.5 h-3.5" /></Button>}
      {can('inventory', 'delete') && <AlertDialog>
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
      </AlertDialog>}
    </div>
  );

  const statusBadge = (p: Product) => (
    <Badge variant={p.status === 'Active' ? 'default' : 'secondary'} className={p.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}>
      {p.status}
    </Badge>
  );

  const normalizedFormUrl = formImageUrl ? normalizeImageUrl(formImageUrl) : '';

  return (
    <div className="p-6 space-y-6">
      <div className="sticky top-0 z-20 -mx-6 -mt-6 px-6 pt-6 pb-4 space-y-4 bg-background/95 backdrop-blur border-b border-border">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inventory</h1>
          <p className="text-sm text-muted-foreground">{shown.length} products</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ViewToggle value={viewMode} onChange={setViewMode} />
          {selectedIds.size > 0 && can('inventory', 'edit') && (
            <Button variant="outline" size="sm" onClick={() => setShowBulk(true)}>
              <CheckSquare className="w-4 h-4 mr-1" /> Bulk Actions ({selectedIds.size})
            </Button>
          )}
          {can('inventory', 'export') && <Button variant="outline" size="sm" className="border-pink-500 text-pink-400 hover:bg-pink-500/10" onClick={handleExport}><Download className="w-4 h-4 mr-1" /> Export</Button>}
          {can('inventory', 'import') && <Button variant="outline" size="sm" className="border-green-500 text-green-400 hover:bg-green-500/10" onClick={() => setImportOpen(true)}><Upload className="w-4 h-4 mr-1" /> Import</Button>}
          {can('categories', 'view') && <Button asChild variant="outline" size="sm"><Link to="/categories"><FolderTree className="w-4 h-4 mr-1" /> Categories</Link></Button>}
          {can('inventory', 'create') && <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Add Product</Button>}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 flex flex-wrap gap-2 items-center">
          <DateRangeFilter value={range} onChange={setRange} />
          <TableControls c={tc} />
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
      {valuation && (
        <SummaryTiles items={range.start || range.end ? [
          { label: 'Opening Inventory', value: fmt(valuation.start?.value ?? valuation.current.value), sub: `${(valuation.start?.units ?? valuation.current.units).toLocaleString()} units` },
          { label: 'Closing Inventory', value: fmt(valuation.end?.value ?? valuation.current.value), sub: `${(valuation.end?.units ?? valuation.current.units).toLocaleString()} units` },
          { label: 'Change', value: fmt((valuation.end?.value ?? valuation.current.value) - (valuation.start?.value ?? valuation.current.value)) },
          { label: 'Current Value', value: fmt(valuation.current.value), sub: `${valuation.current.units.toLocaleString()} units` },
        ] : [
          { label: 'Inventory Value', value: fmt(valuation.current.value), sub: 'At cost price' },
          { label: 'Units in Stock', value: valuation.current.units.toLocaleString() },
          { label: 'Products', value: String(products.length) },
          { label: 'Low Stock', value: String(products.filter(p => (p.stockQuantity || 0) <= (p.reorderLevel || 0)).length) },
        ]} />
      )}
      <CategoryRibbon categories={categories} selected={categoryFilter} onSelect={setCategoryFilter} />
      </div>

      {viewMode === 'list' ? (
        <Card className="bg-card border-border">
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[65vh]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-border text-muted-foreground bg-card">
                    <th className="p-3 w-8"><input type="checkbox" checked={selectedIds.size === shown.length && shown.length > 0} onChange={toggleAll} className="rounded" /></th>
                    <SortTh c={tc} k="productName" className="text-left">Product</SortTh>
                    <SortTh c={tc} k="sku" className="text-left">SKU</SortTh>
                    <SortTh c={tc} k="costPrice" className="text-right">Cost</SortTh>
                    <SortTh c={tc} k="sellingPrice" className="text-right">Selling</SortTh>
                    <SortTh c={tc} k="stockQuantity" className="text-right">Stock</SortTh>
                    <SortTh c={tc} k="status" className="text-center">Status</SortTh>
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
                  ) : tc.view.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-muted-foreground">
                        <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
                        No products found
                      </td>
                    </tr>
                  ) : (
                    tc.view.map((p: Product) => (
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
          {shown.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground select-none w-fit cursor-pointer">
              <input type="checkbox" checked={selectedIds.size === shown.length} onChange={toggleAll} className="rounded" />
              Select all
            </label>
          )}
          {/* Six tiles per row on large screens */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 items-stretch">
            {loading ? (
              [...Array(6)].map((_, i) => (
                <Card key={i} className="bg-card border-border"><CardContent className="p-2"><div className="aspect-[2/1] bg-muted rounded animate-pulse" /></CardContent></Card>
              ))
            ) : tc.view.length === 0 ? (
              <Card className="col-span-full bg-card border-border">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  No products found
                </CardContent>
              </Card>
            ) : tc.view.map((p: Product) => (
              <Card key={p.id} className={`bg-card flex flex-col ${selectedIds.has(p.id) ? 'border-primary' : 'border-border'}`}>
                <CardContent className="p-2 space-y-1.5 flex flex-col flex-1">
                  <div className="relative">
                    <ProductImage src={photoOf(p)} alt={p.productName} className="w-full !aspect-[2/1]" />
                    <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} className="absolute top-1.5 left-1.5 rounded" />
                    <div className="absolute top-1.5 right-1.5 scale-90 origin-top-right">{statusBadge(p)}</div>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[14.4px] font-medium text-foreground break-words whitespace-normal leading-snug [overflow-wrap:anywhere]">{p.productName}</p>
                    <p className="text-[11px] text-muted-foreground font-mono break-all mt-0.5">{p.sku}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-[11px] leading-tight mt-auto">
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
                  <div className="border-t border-border pt-1">{renderActions(p)}</div>
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
        description={<>
          Upload a CSV with columns: <span className="font-medium text-foreground">Product Name, SKU, Cost Price, Selling Price, Stock Quantity, Category (optional), Subcategory (optional), Image URL (optional)</span>. Products matched by SKU are updated. <span className="font-medium text-foreground">Category</span> is the main category and <span className="font-medium text-foreground">Subcategory</span> the one under it (e.g. E-Liquids / Salt Nic); put the Category in the same row as the Subcategory. Unknown categories and subcategories are created automatically.
          <br /><br />
          <span className="font-medium text-foreground">Image URL</span> must be a direct link to a photo already hosted online — Google Drive and Dropbox share links are converted automatically. For other sites, use the direct image address (right-click the photo → "Copy Image Address"), not a viewer page link. Free options: imgur.com, ImgBB, or Cloudinary. A blank Image URL leaves an existing product's photo unchanged. Press OK to start the import. (In Excel: File → Save As → CSV.)
        </>}
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
            <div className="flex items-start gap-4">
              <ProductImage src={normalizedFormUrl || null} alt="Product photo" className="w-24 h-24" />
              <div className="space-y-2 flex-1 min-w-0">
                <Label className="block">Product photo link</Label>
                <Input
                  value={formImageUrl}
                  onChange={e => setFormImageUrl(e.target.value)}
                  placeholder="https://example.com/photo.jpg"
                />
                {formImageUrl && !isDirectImageUrl(normalizedFormUrl) && (
                  <p className="text-[11px] text-amber-400">
                    This looks like a page link rather than a direct image link. If the photo doesn't appear after saving, use the direct image address instead (right-click the photo → "Copy Image Address").
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Paste a link to a photo already hosted online. Google Drive and Dropbox share links are converted automatically. Other options: imgur.com, ImgBB, Cloudinary. Leave blank to remove the photo.
                </p>
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
                    {categoryOptions.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
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
                  <SelectContent>{categoryOptions.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent>
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
