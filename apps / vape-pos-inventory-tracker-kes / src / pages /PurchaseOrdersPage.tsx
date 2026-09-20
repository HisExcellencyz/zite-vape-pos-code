import { useState, useEffect } from 'react';
import {
  getPurchaseOrders, savePurchaseOrder, verifyPurchaseOrder,
  generateLpoPdf, exportLpoCsv, getProducts, getSuppliers, deleteRecord
} from 'zitejs/api';
import { Card, CardContent } from '@project/components/ui/card';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Badge } from '@project/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@project/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@project/components/ui/tabs';
import { Checkbox } from '@project/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@project/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@project/components/ui/dropdown-menu';
import {
  Plus, Download, FileText, Search, Trash2, ClipboardCheck,
  FileSpreadsheet, Eye, Send
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { downloadCsv } from '../lib/exportHelper';
import { DatePicker } from '@project/components/ui/date-picker';
import ViewToggle, { useViewMode } from '../components/ViewToggle';

interface LPOItem {
  productId: string;
  productName: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
  verified?: boolean;
  verifiedQty?: number;
}

interface PurchaseOrder {
  id: string;
  lpoNumber?: string;
  supplierName?: string;
  supplier?: string[];
  orderDate?: string;
  expectedDeliveryDate?: string;
  status?: string;
  totalAmount?: number;
  notes?: string;
  itemsJson?: string;
}

interface Product { id: string; productName?: string; sku?: string; costPrice?: number; }
interface Supplier { id: string; supplierName?: string; }

const statusColors: Record<string, string> = {
  draft: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  sent: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  partial: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  verified: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  cancelled: 'bg-red-500/10 text-red-400 border-red-500/20',
};

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showVerify, setShowVerify] = useState<PurchaseOrder | null>(null);
  const [showDetail, setShowDetail] = useState<PurchaseOrder | null>(null);
  const [viewMode, setViewMode] = useViewMode('purchase-orders', 'list');

  // Form state
  const [editId, setEditId] = useState<string | undefined>();
  const [supplierId, setSupplierId] = useState('');
  const [orderDate, setOrderDate] = useState<Date | undefined>(new Date());
  const [expectedDate, setExpectedDate] = useState<Date | undefined>(undefined);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<LPOItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [saving, setSaving] = useState(false);

  // Verify state
  const [verifyItems, setVerifyItems] = useState<LPOItem[]>([]);
  const [verifying, setVerifying] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [o, p, s] = await Promise.all([
        getPurchaseOrders({}),
        getProducts({}),
        getSuppliers({}),
      ]);
      setOrders(o.orders as PurchaseOrder[]);
      setProducts(p.products as Product[]);
      setSuppliers(s.suppliers as Supplier[]);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const fmt = (n?: number) => `KES ${(n || 0).toLocaleString()}`;

  const openNewForm = () => {
    setEditId(undefined);
    setSupplierId('');
    setOrderDate(new Date());
    setExpectedDate(undefined);
    setNotes('');
    setItems([]);
    setShowForm(true);
  };

  const openEditForm = (o: PurchaseOrder) => {
    setEditId(o.id);
    setSupplierId(o.supplier?.[0] || '');
    setOrderDate(o.orderDate ? new Date(o.orderDate) : new Date());
    setExpectedDate(o.expectedDeliveryDate ? new Date(o.expectedDeliveryDate) : undefined);
    setNotes(o.notes || '');
    try { setItems(JSON.parse(o.itemsJson || '[]')); } catch { setItems([]); }
    setShowForm(true);
  };

  const filteredProducts = products.filter(p =>
    (p.productName || '').toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.sku || '').toLowerCase().includes(productSearch.toLowerCase())
  );

  const addProduct = (p: Product) => {
    const existing = items.find(i => i.productId === p.id);
    if (existing) {
      setItems(items.map(i => i.productId === p.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setItems([...items, { productId: p.id, productName: p.productName || '', sku: p.sku, quantity: 1, unitPrice: p.costPrice || 0 }]);
    }
    setProductSearch('');
  };

  const itemsTotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  const handleSave = async () => {
    if (!supplierId) return toast.error('Select a supplier');
    if (items.length === 0) return toast.error('Add at least one product');
    setSaving(true);
    try {
      await savePurchaseOrder({
        id: editId,
        supplierId,
        orderDate: orderDate ? format(orderDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
        expectedDeliveryDate: expectedDate ? format(expectedDate, 'yyyy-MM-dd') : undefined,
        notes: notes || undefined,
        items,
      });
      toast.success(editId ? 'LPO updated' : 'LPO created');
      setShowForm(false);
      load();
    } catch (e: any) { toast.error(e.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const openVerify = (o: PurchaseOrder) => {
    let parsed: LPOItem[] = [];
    try { parsed = JSON.parse(o.itemsJson || '[]'); } catch {}
    setVerifyItems(parsed.map(i => ({
      ...i,
      verified: i.verified || false,
      verifiedQty: i.verifiedQty ?? i.quantity,
    })));
    setShowVerify(o);
  };

  const handleVerify = async () => {
    if (!showVerify) return;
    setVerifying(true);
    try {
      const res = await verifyPurchaseOrder({ orderId: showVerify.id, items: verifyItems.map(i => ({ ...i, verified: i.verified ?? false, verifiedQty: i.verifiedQty ?? 0 })) });
      toast.success(res.message);
      setShowVerify(null);
      load();
    } catch (e: any) { toast.error(e.message || 'Failed'); }
    finally { setVerifying(false); }
  };

  const handleDownloadPdf = async (o: PurchaseOrder, branded = true) => {
    try {
      toast.info(`Generating ${branded ? 'branded' : 'unbranded'} PDF...`);
      const res = await generateLpoPdf({ orderId: o.id, branded });
      // Download directly to device
      const link = document.createElement('a');
      link.href = res.url;
      link.download = `${o.lpoNumber || 'LPO'}${branded ? '' : '-unbranded'}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch { toast.error('PDF generation failed'); }
  };

  const handleDownloadExcel = async (o: PurchaseOrder) => {
    try {
      const res = await exportLpoCsv({ orderId: o.id });
      downloadCsv(res.csv, res.filename);
      toast.success('Downloaded');
    } catch { toast.error('Export failed'); }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRecord({ table: 'purchaseOrders', id });
      toast.success('Deleted');
      load();
    } catch { toast.error('Delete failed'); }
  };

  const handleMarkSent = async (o: PurchaseOrder) => {
    try {
      let parsed: LPOItem[] = [];
      try { parsed = JSON.parse(o.itemsJson || '[]'); } catch {}
      await savePurchaseOrder({
        id: o.id,
        supplierId: o.supplier?.[0] || '',
        orderDate: o.orderDate || new Date().toISOString(),
        items: parsed,
      });
      // Update status directly
      // For now we re-use save; ideally we'd have a status update endpoint
      toast.success('Marked as sent');
      load();
    } catch { toast.error('Failed'); }
  };

  const renderActions = (o: PurchaseOrder) => (
    <div className="flex items-center justify-end gap-1 flex-wrap">
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowDetail(o)} title="View">
        <Eye className="w-3.5 h-3.5" />
      </Button>
      {o.status !== 'verified' && o.status !== 'cancelled' && (
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openVerify(o)} title="Verify">
          <ClipboardCheck className="w-3.5 h-3.5" />
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Download PDF">
            <FileText className="w-3.5 h-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => handleDownloadPdf(o, true)}>Branded PDF</DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleDownloadPdf(o, false)}>Unbranded PDF</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDownloadExcel(o)} title="Excel">
        <FileSpreadsheet className="w-3.5 h-3.5" />
      </Button>
      {o.status === 'draft' && (
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditForm(o)} title="Edit">
          <Search className="w-3.5 h-3.5" />
        </Button>
      )}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {o.lpoNumber}?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleDelete(o.id)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  const statusBadge = (o: PurchaseOrder) => (
    <Badge variant="secondary" className={statusColors[o.status || 'draft'] || statusColors.draft}>
      {o.status || 'Draft'}
    </Badge>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Purchase Orders</h1>
          <p className="text-sm text-muted-foreground">{orders.length} LPOs</p>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle value={viewMode} onChange={setViewMode} />
          <Button size="sm" onClick={openNewForm}><Plus className="w-4 h-4 mr-1" /> New LPO</Button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <Card className="bg-card border-border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left p-3 font-medium">LPO #</th>
                    <th className="text-left p-3 font-medium">Supplier</th>
                    <th className="text-left p-3 font-medium">Date</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-right p-3 font-medium">Total</th>
                    <th className="text-right p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [...Array(4)].map((_, i) => (
                      <tr key={i} className="border-b border-border">
                        {[...Array(6)].map((_, j) => <td key={j} className="p-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}
                      </tr>
                    ))
                  ) : orders.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">
                      <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
                      No purchase orders yet
                    </td></tr>
                  ) : orders.map(o => (
                    <tr key={o.id} className="border-b border-border hover:bg-muted/30">
                      <td className="p-3 font-mono text-xs text-primary font-semibold">{o.lpoNumber}</td>
                      <td className="p-3 text-foreground break-words whitespace-normal">{o.supplierName}</td>
                      <td className="p-3 text-foreground whitespace-nowrap">{o.orderDate ? format(new Date(o.orderDate), 'dd MMM yyyy') : '-'}</td>
                      <td className="p-3">{statusBadge(o)}</td>
                      <td className="p-3 text-right font-semibold text-foreground whitespace-nowrap">{fmt(o.totalAmount)}</td>
                      <td className="p-3 text-right">{renderActions(o)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {loading ? (
            [...Array(3)].map((_, i) => (
              <Card key={i} className="bg-card border-border"><CardContent className="p-4"><div className="h-28 bg-muted rounded animate-pulse" /></CardContent></Card>
            ))
          ) : orders.length === 0 ? (
            <Card className="col-span-full bg-card border-border">
              <CardContent className="py-12 text-center text-muted-foreground">
                <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
                No purchase orders yet
              </CardContent>
            </Card>
          ) : orders.map(o => (
            <Card key={o.id} className="bg-card border-border">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-mono text-sm text-primary font-semibold break-all min-w-0">{o.lpoNumber}</p>
                  <div className="shrink-0">{statusBadge(o)}</div>
                </div>
                <p className="text-sm font-medium text-foreground break-words whitespace-normal">{o.supplierName}</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="min-w-0">
                    <p className="text-muted-foreground">Order Date</p>
                    <p className="text-foreground">{o.orderDate ? format(new Date(o.orderDate), 'dd MMM yyyy') : '-'}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-muted-foreground">Expected</p>
                    <p className="text-foreground">{o.expectedDeliveryDate ? format(new Date(o.expectedDeliveryDate), 'dd MMM yyyy') : '-'}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Total</span>
                  <span className="text-lg font-bold text-primary break-words text-right">{fmt(o.totalAmount)}</span>
                </div>
                <div className="border-t border-border pt-2">{renderActions(o)}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit LPO Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? 'Edit' : 'New'} Purchase Order</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Supplier *</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>{suppliers.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.supplierName}</SelectItem>
                  ))}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Order Date</Label>
                <DatePicker value={orderDate} onChange={setOrderDate} />
              </div>
            </div>
            <div>
              <Label>Expected Delivery Date</Label>
              <DatePicker value={expectedDate} onChange={setExpectedDate} />
            </div>

            {/* Add products */}
            <div>
              <Label>Products</Label>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search products..." value={productSearch} onChange={e => setProductSearch(e.target.value)} className="pl-9" />
              </div>
              {productSearch && (
                <div className="max-h-32 overflow-y-auto border border-border rounded-lg">
                  {filteredProducts.slice(0, 10).map(p => (
                    <button key={p.id} onClick={() => addProduct(p)} className="w-full text-left p-2 hover:bg-muted text-sm flex justify-between gap-2">
                      <span className="break-words whitespace-normal min-w-0">{p.productName} <span className="text-muted-foreground text-xs">({p.sku})</span></span>
                      <span className="text-muted-foreground shrink-0">{fmt(p.costPrice)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {items.length > 0 && (
              <div className="space-y-2">
                {items.map((item, i) => (
                  <div key={item.productId} className="flex items-center gap-3 bg-muted/50 rounded-lg p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground break-words whitespace-normal">{item.productName}</p>
                      <p className="text-xs text-muted-foreground break-all">{item.sku}</p>
                    </div>
                    <Input type="number" value={item.quantity} onChange={e => setItems(items.map((it, j) => j === i ? { ...it, quantity: Number(e.target.value) || 1 } : it))} className="w-16 h-8 text-center" />
                    <span className="text-xs text-muted-foreground">×</span>
                    <Input type="number" value={item.unitPrice} onChange={e => setItems(items.map((it, j) => j === i ? { ...it, unitPrice: Number(e.target.value) || 0 } : it))} className="w-24 h-8" />
                    <span className="text-sm font-semibold w-24 text-right">{fmt(item.unitPrice * item.quantity)}</span>
                    <button onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                  </div>
                ))}
                <div className="flex justify-end text-lg font-bold text-primary">Total: {fmt(itemsTotal)}</div>
              </div>
            )}

            <div>
              <Label>Notes</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editId ? 'Update LPO' : 'Create LPO'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verify Dialog */}
      <Dialog open={!!showVerify} onOpenChange={() => setShowVerify(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Verify Delivery — {showVerify?.lpoNumber}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Check each product received and confirm quantities. Once all verified, a purchase will be auto-recorded.</p>
          <div className="space-y-2 mt-4">
            {verifyItems.map((item, i) => (
              <div key={item.productId} className="flex items-center gap-3 bg-muted/50 rounded-lg p-3">
                <Checkbox
                  checked={item.verified}
                  onCheckedChange={(checked) => setVerifyItems(verifyItems.map((it, j) => j === i ? { ...it, verified: !!checked } : it))}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground break-words whitespace-normal">{item.productName}</p>
                  <p className="text-xs text-muted-foreground">Ordered: {item.quantity} @ {fmt(item.unitPrice)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Received:</Label>
                  <Input
                    type="number"
                    value={item.verifiedQty}
                    onChange={e => setVerifyItems(verifyItems.map((it, j) => j === i ? { ...it, verifiedQty: Number(e.target.value) || 0 } : it))}
                    className="w-20 h-8 text-center"
                    disabled={!item.verified}
                  />
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVerify(null)}>Cancel</Button>
            <Button onClick={handleVerify} disabled={verifying}>
              {verifying ? 'Verifying...' : 'Confirm Verification'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail View Dialog */}
      <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{showDetail?.lpoNumber}</DialogTitle>
          </DialogHeader>
          {showDetail && (() => {
            let parsed: LPOItem[] = [];
            try { parsed = JSON.parse(showDetail.itemsJson || '[]'); } catch {}
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Supplier:</span> <span className="font-medium break-words">{showDetail.supplierName}</span></div>
                  <div><span className="text-muted-foreground">Status:</span> <Badge variant="secondary" className={statusColors[showDetail.status || 'draft']}>{showDetail.status}</Badge></div>
                  <div><span className="text-muted-foreground">Date:</span> {showDetail.orderDate ? format(new Date(showDetail.orderDate), 'dd MMM yyyy') : '-'}</div>
                  <div><span className="text-muted-foreground">Expected:</span> {showDetail.expectedDeliveryDate ? format(new Date(showDetail.expectedDeliveryDate), 'dd MMM yyyy') : '-'}</div>
                </div>
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-muted/50 text-muted-foreground text-xs">
                      <th className="text-left p-2">Product</th><th className="text-right p-2">Qty</th><th className="text-right p-2">Price</th><th className="text-right p-2">Total</th><th className="text-center p-2">✓</th>
                    </tr></thead>
                    <tbody>
                      {parsed.map(item => (
                        <tr key={item.productId} className="border-t border-border">
                          <td className="p-2 break-words whitespace-normal">{item.productName}</td>
                          <td className="p-2 text-right">{item.quantity}</td>
                          <td className="p-2 text-right">{fmt(item.unitPrice)}</td>
                          <td className="p-2 text-right">{fmt(item.unitPrice * item.quantity)}</td>
                          <td className="p-2 text-center">{item.verified ? `✓ ${item.verifiedQty}` : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-right text-lg font-bold text-primary">{fmt(showDetail.totalAmount)}</div>
                {showDetail.notes && <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg break-words">{showDetail.notes}</p>}
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => handleDownloadPdf(showDetail)}><FileText className="w-4 h-4 mr-1" /> PDF</Button>
                  <Button variant="outline" size="sm" onClick={() => handleDownloadExcel(showDetail)}><FileSpreadsheet className="w-4 h-4 mr-1" /> Excel</Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
