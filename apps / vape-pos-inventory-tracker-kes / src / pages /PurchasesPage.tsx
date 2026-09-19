import { useState, useEffect } from 'react';
import { getPurchases, getProducts, getSuppliers, createPurchase, exportCsv } from 'zitejs/api';
import { Card, CardContent } from '@project/components/ui/card';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Badge } from '@project/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@project/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Plus, Download, ShoppingBag, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { downloadCsv } from '../lib/exportHelper';

interface Purchase {
  id: string;
  purchaseNumber?: number;
  purchaseDate?: string;
  total?: number;
  paymentType?: string;
  notes?: string;
}

interface Product { id: string; productName?: string; sku?: string; costPrice?: number; }
interface Supplier { id: string; supplierName?: string; depositBalance?: number; }

interface CartItem { product: Product; quantity: number; unitPrice: number; }

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [paymentType, setPaymentType] = useState<'cash' | 'deposit'>('cash');
  const [notes, setNotes] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [p, prods, sups] = await Promise.all([
        getPurchases({}),
        getProducts({}),
        getSuppliers({}),
      ]);
      setPurchases(p.purchases as Purchase[]);
      setProducts(prods.products as Product[]);
      setSuppliers(sups.suppliers as Supplier[]);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filteredProducts = products.filter(p =>
    (p.productName || '').toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.sku || '').toLowerCase().includes(productSearch.toLowerCase())
  );

  const addToCart = (product: Product) => {
    const existing = cart.find(c => c.product.id === product.id);
    if (existing) {
      setCart(cart.map(c => c.product.id === product.id ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      setCart([...cart, { product, quantity: 1, unitPrice: product.costPrice || 0 }]);
    }
  };

  const total = cart.reduce((sum, c) => sum + c.unitPrice * c.quantity, 0);
  const selectedSup = suppliers.find(s => s.id === selectedSupplier);

  const handleSave = async () => {
    if (cart.length === 0) return toast.error('Add at least one product');
    setSaving(true);
    try {
      await createPurchase({
        supplierId: selectedSupplier || undefined,
        items: cart.map(c => ({ productId: c.product.id, quantity: c.quantity, unitPrice: c.unitPrice })),
        paymentType,
        notes: notes || undefined,
      });
      toast.success('Purchase recorded');
      setShowForm(false);
      setCart([]);
      setSelectedSupplier('');
      setPaymentType('cash');
      setNotes('');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Failed');
    } finally { setSaving(false); }
  };

  const handleExport = async () => {
    try {
      const res = await exportCsv({ table: 'purchases' });
      downloadCsv(res.csv, res.filename);
      toast.success('Exported');
    } catch { toast.error('Export failed'); }
  };

  const fmt = (n?: number) => `KES ${(n || 0).toLocaleString()}`;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Purchases</h1>
          <p className="text-sm text-muted-foreground">{purchases.length} purchase records</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="border-pink-500 text-pink-400 hover:bg-pink-500/10" onClick={handleExport}><Download className="w-4 h-4 mr-1" /> Export</Button>
          <Button size="sm" onClick={() => setShowForm(true)}><Plus className="w-4 h-4 mr-1" /> Add Purchase</Button>
        </div>
      </div>

      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left p-3 font-medium">#</th>
                  <th className="text-left p-3 font-medium">Date</th>
                  <th className="text-left p-3 font-medium">Payment</th>
                  <th className="text-right p-3 font-medium">Total</th>
                  <th className="text-left p-3 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      {[...Array(5)].map((_, j) => <td key={j} className="p-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}
                    </tr>
                  ))
                ) : purchases.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-12 text-muted-foreground">
                    <ShoppingBag className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    No purchases recorded yet
                  </td></tr>
                ) : purchases.map(p => (
                  <tr key={p.id} className="border-b border-border hover:bg-muted/30">
                    <td className="p-3 font-mono text-xs text-muted-foreground">#{p.purchaseNumber}</td>
                    <td className="p-3 text-foreground">{p.purchaseDate ? format(new Date(p.purchaseDate), 'dd MMM yyyy HH:mm') : '-'}</td>
                    <td className="p-3">
                      <Badge variant="secondary" className={p.paymentType === 'From Deposit' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}>
                        {p.paymentType}
                      </Badge>
                    </td>
                    <td className="p-3 text-right font-semibold text-foreground">{fmt(p.total)}</td>
                    <td className="p-3 text-muted-foreground text-xs">{p.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* New Purchase Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Purchase</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Supplier</Label>
                <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                  <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.supplierName} (Bal: {fmt(s.depositBalance)})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Payment Type</Label>
                <Select value={paymentType} onValueChange={v => setPaymentType(v as 'cash' | 'deposit')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="deposit">From Supplier Deposit</SelectItem>
                  </SelectContent>
                </Select>
                {paymentType === 'deposit' && selectedSup && (
                  <p className="text-xs text-muted-foreground mt-1">Available balance: {fmt(selectedSup.depositBalance)}</p>
                )}
              </div>
            </div>

            {/* Add products */}
            <div>
              <Label>Add Products</Label>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search products..." value={productSearch} onChange={e => setProductSearch(e.target.value)} className="pl-9" />
              </div>
              {productSearch && (
                <div className="max-h-32 overflow-y-auto border border-border rounded-lg">
                  {filteredProducts.slice(0, 10).map(p => (
                    <button key={p.id} onClick={() => { addToCart(p); setProductSearch(''); }} className="w-full text-left p-2 hover:bg-muted text-sm flex justify-between">
                      <span>{p.productName} <span className="text-muted-foreground text-xs">({p.sku})</span></span>
                      <span className="text-muted-foreground">{fmt(p.costPrice)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Cart */}
            {cart.length > 0 && (
              <div className="space-y-2">
                {cart.map((item, i) => (
                  <div key={item.product.id} className="flex items-center gap-3 bg-muted/50 rounded-lg p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{item.product.productName}</p>
                    </div>
                    <Input type="number" value={item.quantity} onChange={e => setCart(cart.map((c, j) => j === i ? { ...c, quantity: Number(e.target.value) || 1 } : c))} className="w-16 h-8 text-center" />
                    <span className="text-xs text-muted-foreground">×</span>
                    <Input type="number" value={item.unitPrice} onChange={e => setCart(cart.map((c, j) => j === i ? { ...c, unitPrice: Number(e.target.value) || 0 } : c))} className="w-24 h-8" />
                    <span className="text-sm font-semibold w-24 text-right">{fmt(item.unitPrice * item.quantity)}</span>
                    <button onClick={() => setCart(cart.filter((_, j) => j !== i))}><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                  </div>
                ))}
                <div className="flex justify-end text-lg font-bold text-primary">Total: {fmt(total)}</div>
              </div>
            )}

            <div>
              <Label>Notes</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Record Purchase'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
