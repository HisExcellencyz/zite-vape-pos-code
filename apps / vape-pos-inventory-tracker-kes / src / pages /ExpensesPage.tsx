import { useState, useEffect } from 'react';
import { getExpenses, getPurchases, getSales, getProducts, getSuppliers, createPurchase, createExpense, exportCsv, importPurchases, importEntries } from 'zitejs/api';
import { Card, CardContent } from '@project/components/ui/card';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Badge } from '@project/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@project/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@project/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Plus, Download, Upload, ShoppingBag, Trash2, Search, FileText, BadgePercent, Wallet, Pencil } from 'lucide-react';
import { DatePicker } from '@project/components/ui/date-picker';
import { EditEntryDialog, DeleteEntryDialog, EntryKind } from '../components/EntryDialogs';
import { usePermissions } from '../hooks/usePermissions';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { downloadCsv } from '../lib/exportHelper';
import ViewToggle, { useViewMode } from '../components/ViewToggle';
import ImportDialog from '../components/ImportDialog';
import { useBranch } from '../hooks/useBranch';
import { useTableControls, TableControls, SortTh, FieldDef } from '../components/TableControls';
import DateRangeFilter, { Range, inRange } from '../components/DateRangeFilter';
import SummaryTiles from '../components/SummaryTiles';

interface Expense { id: string; expenseNumber?: number; expenseDate?: string; description?: string; amount?: number; notes?: string; }
interface Purchase { id: string; purchaseNumber?: number; purchaseDate?: string; total?: number; paymentType?: string; notes?: string; }
interface Product { id: string; productName?: string; sku?: string; costPrice?: number; }
interface Supplier { id: string; supplierName?: string; depositBalance?: number; }
interface CartItem { product: Product; quantity: number; unitPrice: number; }
interface DiscountRow { id: string; saleNumber?: number; saleDate?: string; subtotal: number; saleTotal: number; amount: number; }
interface DeductionRow { id: string; saleNumber?: number; saleDate?: string; details: string; saleTotal: number; amount: number; }

const PF: FieldDef<Purchase>[] = [
  { key: 'purchaseNumber', label: '#' },
  { key: 'purchaseDate', label: 'Date', get: p => p.purchaseDate || '' },
  { key: 'paymentType', label: 'Payment' },
  { key: 'total', label: 'Total' },
  { key: 'notes', label: 'Notes' },
];
const EF: FieldDef<Expense>[] = [
  { key: 'expenseNumber', label: '#' }, { key: 'expenseDate', label: 'Date' }, { key: 'description', label: 'Description' }, { key: 'amount', label: 'Amount' }, { key: 'notes', label: 'Notes' },
];
const DF: FieldDef<DeductionRow>[] = [
  { key: 'saleNumber', label: 'Sale #' }, { key: 'saleDate', label: 'Date' }, { key: 'details', label: 'Deductions' }, { key: 'saleTotal', label: 'Sale Total' }, { key: 'amount', label: 'Amount' },
];
const XF: FieldDef<DiscountRow>[] = [
  { key: 'saleNumber', label: 'Sale #' }, { key: 'saleDate', label: 'Date' }, { key: 'subtotal', label: 'Before Discount' }, { key: 'saleTotal', label: 'Sale Total' }, { key: 'amount', label: 'Discount' },
];

const fmt = (n?: number) => `KES ${(n || 0).toLocaleString()}`;
const q = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('purchases');
  const [viewMode, setViewMode] = useViewMode('expenses', 'list');
  const { currentBranch } = useBranch();
  const [range, setRange] = useState<Range>({});
  const { can, canBackdate } = usePermissions();
  const [editT, setEditT] = useState<{ kind: EntryKind; entry: any } | null>(null);
  const [delT, setDelT] = useState<{ kind: EntryKind; entry: any } | null>(null);
  const [formDate, setFormDate] = useState<Date | undefined>(new Date());

  // Other expense form
  const [showForm, setShowForm] = useState(false);
  const [formDesc, setFormDesc] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Purchase form
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [paymentType, setPaymentType] = useState<'cash' | 'deposit'>('cash');
  const [pNotes, setPNotes] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [savingPurchase, setSavingPurchase] = useState(false);

  const dP = purchases.filter(x => inRange(range, x.purchaseDate));
  const dE = expenses.filter(x => inRange(range, x.expenseDate));
  const dD: DeductionRow[] = sales
    .filter(s => s.status !== 'Voided' && (s.deductions || 0) > 0 && inRange(range, s.saleDate))
    .map(s => {
      let list: { name: string; amount: number }[] = [];
      try { list = s.deductionDetails ? JSON.parse(s.deductionDetails) : []; } catch {}
      return {
        id: s.id, saleNumber: s.saleNumber, saleDate: s.saleDate,
        details: list.map(d => `${d.name} (${fmt(d.amount)})`).join(', ') || 'Deductions',
        saleTotal: s.total || 0, amount: s.deductions || 0,
      };
    });
  const tcP = useTableControls(dP, PF);
  const tcE = useTableControls(dE, EF);
  // Discounts given at the till are an expense too (the Before Discount column shows the full price, so sales revenue is counted gross).
  const dX: DiscountRow[] = sales
    .filter(s => s.status !== 'Voided' && (s.discount || 0) > 0 && inRange(range, s.saleDate))
    .map(s => ({
      id: s.id, saleNumber: s.saleNumber, saleDate: s.saleDate,
      subtotal: (s.total || 0) + (s.discount || 0), saleTotal: s.total || 0, amount: s.discount || 0,
    }));
  const tcD = useTableControls(dD, DF);
  const tcX = useTableControls(dX, XF);

  const load = async () => {
    setLoading(true);
    try {
      const [e, p, s, prods, sups] = await Promise.all([
        getExpenses({ branchId: currentBranch?.id }),
        getPurchases({ branchId: currentBranch?.id }),
        getSales({ branchId: currentBranch?.id }),
        getProducts({ branchId: currentBranch?.id }),
        getSuppliers({}),
      ]);
      setExpenses(e.expenses as Expense[]);
      setPurchases(p.purchases as Purchase[]);
      setSales(s.sales as any[]);
      setProducts(prods.products as Product[]);
      setSuppliers(sups.suppliers as Supplier[]);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [currentBranch?.id]);

  // Purchases are allowed by either the Expenses or the Purchases area.
  const areaOf = (kind: EntryKind) => (kind === 'purchase' ? ['expenses', 'purchases'] : ['expenses']);
  const allow = (kind: EntryKind, action: string) => areaOf(kind).some(a => can(a, action));
  const rowActions = (kind: EntryKind, entry: any) => {
    const e = allow(kind, 'edit'), d = allow(kind, 'delete');
    if (!e && !d) return null;
    return (
      <div className="flex justify-end gap-0.5">
        {e && <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Edit" onClick={() => setEditT({ kind, entry })}><Pencil className="w-3.5 h-3.5" /></Button>}
        {d && <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" title={kind === 'deduction' ? 'Clear deductions' : 'Delete'} onClick={() => setDelT({ kind, entry })}><Trash2 className="w-3.5 h-3.5" /></Button>}
      </div>
    );
  };
  const colsP = allow('purchase', 'edit') || allow('purchase', 'delete') ? 1 : 0;
  const colsD = allow('deduction', 'edit') || allow('deduction', 'delete') ? 1 : 0;
  const colsE = allow('expense', 'edit') || allow('expense', 'delete') ? 1 : 0;

  const sumOf = (xs: any[], k: string) => xs.reduce((s, x) => s + (x[k] || 0), 0);
  const totalPurchases = sumOf(dP, 'total');
  const totalExpenses = sumOf(dE, 'amount');
  const totalDeductions = sumOf(dD, 'amount');
  const totalDiscounts = sumOf(dX, 'amount');
  const grandTotal = totalPurchases + totalExpenses + totalDeductions + totalDiscounts;

  // ── Other expenses ──
  const handleSave = async () => {
    if (!formDesc) return toast.error('Description is required');
    if (!formAmount || Number(formAmount) <= 0) return toast.error('Valid amount is required');
    setSaving(true);
    try {
      await createExpense({
        description: formDesc, amount: Number(formAmount), notes: formNotes || undefined, branchId: currentBranch?.id,
        date: canBackdate && formDate && format(formDate, 'yyyy-MM-dd') !== format(new Date(), 'yyyy-MM-dd') ? new Date(format(formDate, 'yyyy-MM-dd') + 'T12:00:00').toISOString() : undefined,
      });
      toast.success('Expense recorded');
      setShowForm(false); setFormDesc(''); setFormAmount(''); setFormNotes(''); setFormDate(new Date());
      load();
    } catch (e: any) { toast.error(e.message || 'Failed'); } finally { setSaving(false); }
  };

  // ── Purchases ──
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

  const cartTotal = cart.reduce((sum, c) => sum + c.unitPrice * c.quantity, 0);
  const selectedSup = suppliers.find(s => s.id === selectedSupplier);

  const handleSavePurchase = async () => {
    if (cart.length === 0) return toast.error('Add at least one product');
    setSavingPurchase(true);
    try {
      await createPurchase({
        supplierId: selectedSupplier || undefined,
        items: cart.map(c => ({ productId: c.product.id, quantity: c.quantity, unitPrice: c.unitPrice })),
        paymentType,
        notes: pNotes || undefined,
        branchId: currentBranch?.id,
      });
      toast.success('Purchase recorded');
      setShowPurchaseForm(false);
      setCart([]); setSelectedSupplier(''); setPaymentType('cash'); setPNotes('');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Failed');
    } finally { setSavingPurchase(false); }
  };

  const runImport = async (rows: Record<string, string>[], adjustStock: boolean) => {
    if (tab === 'other') {
      const r = await importEntries({ kind: 'expenses', rows });
      return { imported: r.imported, updated: r.updated, skipped: r.skipped, errors: r.errors };
    }
    const res = await importPurchases({ rows, adjustStock });
    return { imported: res.imported, updated: res.updated, skipped: res.skipped, errors: res.errors };
  };

  const handleExport = async () => {
    try {
      if (tab === 'discounts') {
        const lines = [['Sale #', 'Date', 'Before Discount', 'Sale Total', 'Discount'].join(',')].concat(
          tcX.view.map(r => [r.saleNumber, r.saleDate, r.subtotal, r.saleTotal, r.amount].map(q).join(',')),
        );
        downloadCsv(lines.join('\n'), 'discounts_export.csv');
      } else if (tab === 'deductions') {
        const lines = [['Sale #', 'Date', 'Deductions', 'Sale Total', 'Amount'].join(',')].concat(
          tcD.view.map(r => [r.saleNumber, r.saleDate, r.details, r.saleTotal, r.amount].map(q).join(',')),
        );
        downloadCsv(lines.join('\n'), 'deductions_export.csv');
      } else {
        const res = await exportCsv({ table: tab === 'purchases' ? 'purchases' : 'expenses' });
        downloadCsv(res.csv, res.filename);
      }
      toast.success('Exported');
    } catch { toast.error('Export failed'); }
  };

  const paymentBadge = (p: Purchase) => (
    <Badge variant="secondary" className={p.paymentType === 'From Deposit' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}>
      {p.paymentType}
    </Badge>
  );

  const tiles =
    tab === 'purchases' ? [
      { label: 'Total Purchases', value: fmt(totalPurchases), sub: `${dP.length} purchases` },
      { label: 'Paid Cash', value: fmt(sumOf(dP.filter(x => x.paymentType !== 'From Deposit'), 'total')) },
      { label: 'From Deposits', value: fmt(sumOf(dP.filter(x => x.paymentType === 'From Deposit'), 'total')) },
      { label: 'Average Purchase', value: fmt(dP.length ? Math.round(totalPurchases / dP.length) : 0) },
    ] : tab === 'discounts' ? [
      { label: 'Discounts', value: fmt(totalDiscounts), sub: `${dX.length} sales` },
      { label: 'Average Discount', value: fmt(dX.length ? Math.round(totalDiscounts / dX.length) : 0) },
      { label: 'Purchases + Other + Deductions', value: fmt(totalPurchases + totalExpenses + totalDeductions) },
      { label: 'Grand Total', value: fmt(grandTotal) },
    ] : tab === 'deductions' ? [
      { label: 'Deductions', value: fmt(totalDeductions), sub: `${dD.length} sales` },
      { label: 'Average Deduction', value: fmt(dD.length ? Math.round(totalDeductions / dD.length) : 0) },
      { label: 'Purchases + Other', value: fmt(totalPurchases + totalExpenses) },
      { label: 'Grand Total', value: fmt(grandTotal) },
    ] : [
      { label: 'Other Expenses', value: fmt(totalExpenses), sub: `${dE.length} records` },
      { label: 'Average Expense', value: fmt(dE.length ? Math.round(totalExpenses / dE.length) : 0) },
      { label: 'Purchases + Deductions + Discounts', value: fmt(totalPurchases + totalDeductions + totalDiscounts) },
      { label: 'Grand Total', value: fmt(grandTotal) },
    ];

  const activeControls = (tab === 'purchases' ? tcP : tab === 'other' ? tcE : tab === 'discounts' ? tcX : tcD) as any;

  return (
    <div className="p-6 space-y-6">
      <div className="sticky top-0 z-20 -mx-6 -mt-6 px-6 pt-6 pb-4 space-y-4 bg-background/95 backdrop-blur border-b border-border">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Expenses</h1>
          <p className="text-sm text-muted-foreground">Total: {fmt(grandTotal)}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ViewToggle value={viewMode} onChange={setViewMode} />
          {allow(tab === 'purchases' ? 'purchase' : 'expense', 'export') && <Button variant="outline" size="sm" className="border-pink-500 text-pink-400 hover:bg-pink-500/10" onClick={handleExport}><Download className="w-4 h-4 mr-1" /> Export</Button>}
          {tab === 'purchases' && (
            <>
              {allow('purchase', 'import') && <Button variant="outline" size="sm" className="border-green-500 text-green-400 hover:bg-green-500/10" onClick={() => setImportOpen(true)}><Upload className="w-4 h-4 mr-1" /> Import</Button>}
              {can('purchaseOrders', 'view') && <Button asChild variant="outline" size="sm"><Link to="/purchase-orders"><FileText className="w-4 h-4 mr-1" /> Purchase Orders</Link></Button>}
              {allow('purchase', 'create') && <Button size="sm" onClick={() => setShowPurchaseForm(true)}><Plus className="w-4 h-4 mr-1" /> Add Purchase</Button>}
            </>
          )}
          {tab === 'other' && (
            <>
              {allow('expense', 'import') && <Button variant="outline" size="sm" className="border-green-500 text-green-400 hover:bg-green-500/10" onClick={() => setImportOpen(true)}><Upload className="w-4 h-4 mr-1" /> Import</Button>}
              {allow('expense', 'create') && <Button size="sm" onClick={() => setShowForm(true)}><Plus className="w-4 h-4 mr-1" /> Add Expense</Button>}
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <DateRangeFilter value={range} onChange={setRange} />
        <TableControls c={activeControls} />
      </div>
      <SummaryTiles items={tiles} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted">
          <TabsTrigger value="purchases">Purchases ({dP.length})</TabsTrigger>
          <TabsTrigger value="deductions">Deductions ({dD.length})</TabsTrigger>
          <TabsTrigger value="discounts">Discounts ({dX.length})</TabsTrigger>
          <TabsTrigger value="other">Other Expenses ({dE.length})</TabsTrigger>
        </TabsList>

        {/* Purchases */}
        <TabsContent value="purchases" className="mt-4">
          {viewMode === 'list' ? (
            <Card className="bg-card border-border"><CardContent className="p-0"><div className="overflow-auto max-h-[65vh]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-card"><tr className="border-b border-border text-muted-foreground bg-card">
                  <SortTh c={tcP} k="purchaseNumber" className="text-left">#</SortTh>
                  <SortTh c={tcP} k="purchaseDate" className="text-left">Date</SortTh>
                  <SortTh c={tcP} k="paymentType" className="text-left">Payment</SortTh>
                  <SortTh c={tcP} k="total" className="text-right">Total</SortTh>
                  <SortTh c={tcP} k="notes" className="text-left">Notes</SortTh>
                  {colsP > 0 && <th className="p-3 w-20" />}
                </tr></thead>
                <tbody>
                  {loading ? (
                    [...Array(5)].map((_, i) => (
                      <tr key={i} className="border-b border-border">
                        {[...Array(5 + colsP)].map((_, j) => <td key={j} className="p-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}
                      </tr>
                    ))
                  ) : tcP.view.length === 0 ? (
                    <tr><td colSpan={5 + colsP} className="text-center py-12 text-muted-foreground">
                      <ShoppingBag className="w-10 h-10 mx-auto mb-2 opacity-40" />
                      No purchases recorded yet
                    </td></tr>
                  ) : tcP.view.map(p => (
                    <tr key={p.id} className="border-b border-border hover:bg-muted/30">
                      <td className="p-3 font-mono text-xs text-muted-foreground">#{p.purchaseNumber}</td>
                      <td className="p-3 text-foreground">{p.purchaseDate ? format(new Date(p.purchaseDate), 'dd MMM yyyy HH:mm') : '-'}</td>
                      <td className="p-3">{paymentBadge(p)}</td>
                      <td className="p-3 text-right font-semibold text-foreground whitespace-nowrap">{fmt(p.total)}</td>
                      <td className="p-3 text-muted-foreground text-xs break-words whitespace-normal max-w-xs">{p.notes || '-'}</td>
                      {colsP > 0 && <td className="p-3">{rowActions('purchase', p)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div></CardContent></Card>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {tcP.view.length === 0 ? (
                <Card className="col-span-full bg-card border-border"><CardContent className="py-12 text-center text-muted-foreground"><ShoppingBag className="w-10 h-10 mx-auto mb-2 opacity-40" />No purchases recorded yet</CardContent></Card>
              ) : tcP.view.map(p => (
                <Card key={p.id} className="bg-card border-border"><CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold text-foreground">#{p.purchaseNumber}</p>
                      <p className="text-xs text-muted-foreground break-words">{p.purchaseDate ? format(new Date(p.purchaseDate), 'dd MMM yyyy HH:mm') : '-'}</p>
                    </div>
                    <div className="shrink-0">{paymentBadge(p)}</div>
                  </div>
                  {p.notes && <p className="text-xs text-muted-foreground break-words whitespace-normal">{p.notes}</p>}
                  <div className="border-t border-border pt-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Total</span>
                    <span className="text-lg font-bold text-primary break-words text-right">{fmt(p.total)}</span>
                  </div>
                  {colsP > 0 && <div className="border-t border-border pt-2">{rowActions('purchase', p)}</div>}
                </CardContent></Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Deductions (commissions etc. applied to sales) */}
        <TabsContent value="deductions" className="mt-4">
          {viewMode === 'list' ? (
            <Card className="bg-card border-border"><CardContent className="p-0"><div className="overflow-auto max-h-[65vh]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-card"><tr className="border-b border-border text-muted-foreground bg-card">
                  <SortTh c={tcD} k="saleNumber" className="text-left">Sale #</SortTh>
                  <SortTh c={tcD} k="saleDate" className="text-left">Date</SortTh>
                  <SortTh c={tcD} k="details" className="text-left">Deductions</SortTh>
                  <SortTh c={tcD} k="saleTotal" className="text-right">Sale Total</SortTh>
                  <SortTh c={tcD} k="amount" className="text-right">Amount</SortTh>
                  {colsD > 0 && <th className="p-3 w-20" />}
                </tr></thead>
                <tbody>
                  {tcD.view.length === 0 ? (
                    <tr><td colSpan={5 + colsD} className="text-center py-12 text-muted-foreground"><BadgePercent className="w-10 h-10 mx-auto mb-2 opacity-40" />{loading ? 'Loading...' : 'No deductions applied to sales'}</td></tr>
                  ) : tcD.view.map(r => (
                    <tr key={r.id} className="border-b border-border hover:bg-muted/30">
                      <td className="p-3 font-mono text-xs text-muted-foreground">#{r.saleNumber}</td>
                      <td className="p-3 text-foreground whitespace-nowrap">{r.saleDate ? format(new Date(r.saleDate), 'dd MMM yyyy HH:mm') : '-'}</td>
                      <td className="p-3 text-foreground break-words whitespace-normal max-w-md">{r.details}</td>
                      <td className="p-3 text-right text-muted-foreground whitespace-nowrap">{fmt(r.saleTotal)}</td>
                      <td className="p-3 text-right font-semibold text-pink-400 whitespace-nowrap">{fmt(r.amount)}</td>
                      {colsD > 0 && <td className="p-3">{rowActions('deduction', sales.find(s => s.id === r.id) || r)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div></CardContent></Card>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {tcD.view.length === 0 ? (
                <Card className="col-span-full bg-card border-border"><CardContent className="py-12 text-center text-muted-foreground"><BadgePercent className="w-10 h-10 mx-auto mb-2 opacity-40" />No deductions applied to sales</CardContent></Card>
              ) : tcD.view.map(r => (
                <Card key={r.id} className="bg-card border-border"><CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-mono text-sm font-semibold text-foreground">Sale #{r.saleNumber}</p>
                    <p className="text-xs text-muted-foreground">{r.saleDate ? format(new Date(r.saleDate), 'dd MMM yyyy') : '-'}</p>
                  </div>
                  <p className="text-xs text-muted-foreground break-words whitespace-normal">{r.details}</p>
                  <div className="border-t border-border pt-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Amount</span>
                    <span className="text-lg font-bold text-pink-400 break-words text-right">{fmt(r.amount)}</span>
                  </div>
                  {colsD > 0 && <div className="border-t border-border pt-2">{rowActions('deduction', sales.find(s => s.id === r.id) || r)}</div>}
                </CardContent></Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Discounts given on sales (an expense, like deductions) */}
        <TabsContent value="discounts" className="mt-4">
          {viewMode === 'list' ? (
            <Card className="bg-card border-border"><CardContent className="p-0"><div className="overflow-auto max-h-[65vh]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-card"><tr className="border-b border-border text-muted-foreground bg-card">
                  <SortTh c={tcX} k="saleNumber" className="text-left">Sale #</SortTh>
                  <SortTh c={tcX} k="saleDate" className="text-left">Date</SortTh>
                  <SortTh c={tcX} k="subtotal" className="text-right">Before Discount</SortTh>
                  <SortTh c={tcX} k="saleTotal" className="text-right">Sale Total</SortTh>
                  <SortTh c={tcX} k="amount" className="text-right">Discount</SortTh>
                </tr></thead>
                <tbody>
                  {tcX.view.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-12 text-muted-foreground"><BadgePercent className="w-10 h-10 mx-auto mb-2 opacity-40" />{loading ? 'Loading...' : 'No discounts given on sales'}</td></tr>
                  ) : tcX.view.map(r => (
                    <tr key={r.id} className="border-b border-border hover:bg-muted/30">
                      <td className="p-3 font-mono text-xs text-muted-foreground">#{r.saleNumber}</td>
                      <td className="p-3 text-foreground whitespace-nowrap">{r.saleDate ? format(new Date(r.saleDate), 'dd MMM yyyy HH:mm') : '-'}</td>
                      <td className="p-3 text-right text-muted-foreground whitespace-nowrap">{fmt(r.subtotal)}</td>
                      <td className="p-3 text-right text-muted-foreground whitespace-nowrap">{fmt(r.saleTotal)}</td>
                      <td className="p-3 text-right font-semibold text-pink-400 whitespace-nowrap">{fmt(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div></CardContent></Card>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {tcX.view.length === 0 ? (
                <Card className="col-span-full bg-card border-border"><CardContent className="py-12 text-center text-muted-foreground"><BadgePercent className="w-10 h-10 mx-auto mb-2 opacity-40" />No discounts given on sales</CardContent></Card>
              ) : tcX.view.map(r => (
                <Card key={r.id} className="bg-card border-border"><CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-mono text-sm font-semibold text-foreground">Sale #{r.saleNumber}</p>
                    <p className="text-xs text-muted-foreground">{r.saleDate ? format(new Date(r.saleDate), 'dd MMM yyyy') : '-'}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{fmt(r.subtotal)} → {fmt(r.saleTotal)}</p>
                  <div className="border-t border-border pt-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Discount</span>
                    <span className="text-lg font-bold text-pink-400 break-words text-right">{fmt(r.amount)}</span>
                  </div>
                </CardContent></Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Other expenses */}
        <TabsContent value="other" className="mt-4">
          {viewMode === 'list' ? (
            <Card className="bg-card border-border"><CardContent className="p-0"><div className="overflow-auto max-h-[65vh]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-card"><tr className="border-b border-border text-muted-foreground bg-card">
                  <SortTh c={tcE} k="expenseNumber" className="text-left">#</SortTh>
                  <SortTh c={tcE} k="expenseDate" className="text-left">Date</SortTh>
                  <SortTh c={tcE} k="description" className="text-left">Description</SortTh>
                  <SortTh c={tcE} k="amount" className="text-right">Amount</SortTh>
                  {colsE > 0 && <th className="p-3 w-20" />}
                </tr></thead>
                <tbody>
                  {tcE.view.length === 0 ? (
                    <tr><td colSpan={4 + colsE} className="text-center py-12 text-muted-foreground"><Wallet className="w-10 h-10 mx-auto mb-2 opacity-40" />No expenses</td></tr>
                  ) : tcE.view.map(e => (
                    <tr key={e.id} className="border-b border-border hover:bg-muted/30">
                      <td className="p-3 font-mono text-xs text-muted-foreground">#{e.expenseNumber}</td>
                      <td className="p-3 text-foreground">{e.expenseDate ? format(new Date(e.expenseDate), 'dd MMM yyyy') : '-'}</td>
                      <td className="p-3 text-foreground break-words whitespace-normal max-w-md">{e.description}</td>
                      <td className="p-3 text-right font-semibold whitespace-nowrap">{fmt(e.amount)}</td>
                      {colsE > 0 && <td className="p-3">{rowActions('expense', e)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div></CardContent></Card>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {tcE.view.length === 0 ? (
                <Card className="col-span-full bg-card border-border"><CardContent className="py-8 text-center text-muted-foreground">No expenses</CardContent></Card>
              ) : tcE.view.map(e => (
                <Card key={e.id} className="bg-card border-border"><CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-mono text-sm font-semibold text-foreground">#{e.expenseNumber}</p>
                    <p className="text-xs text-muted-foreground">{e.expenseDate ? format(new Date(e.expenseDate), 'dd MMM yyyy') : '-'}</p>
                  </div>
                  <p className="text-sm text-foreground break-words whitespace-normal">{e.description}</p>
                  {e.notes && <p className="text-xs text-muted-foreground break-words whitespace-normal">{e.notes}</p>}
                  <div className="border-t border-border pt-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Amount</span>
                    <span className="text-lg font-bold text-primary break-words text-right">{fmt(e.amount)}</span>
                  </div>
                  {colsE > 0 && <div className="border-t border-border pt-2">{rowActions('expense', e)}</div>}
                </CardContent></Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title={tab === 'other' ? 'Import Other Expenses' : 'Import Purchases'}
        template={tab === 'other' ? 'expenses' : 'purchases'}
        optionLabel={tab === 'other' ? undefined : 'Also add the imported quantities to current stock (leave off for old purchases already reflected in your stock counts)'}
        description={tab === 'other' ? <>
          Upload a CSV with one row per expense. Columns: <span className="font-medium text-foreground">Description, Amount, Notes</span>
          {canBackdate && <>, plus <span className="font-medium text-foreground">Date</span> (YYYY-MM-DD or DD/MM/YYYY) for backdated entries, and <span className="font-medium text-foreground">Entry Number</span> to change the date (or details) of an existing expense</>}.
          {!canBackdate && <> Entries are dated today. Only the Owner and Admin can import backdated or re-dated entries.</>} Press OK to start.
        </> : <>
          Upload a CSV with one row per product line. Rows sharing the same <span className="font-medium text-foreground">Purchase Ref</span> become one purchase.
          Columns: <span className="font-medium text-foreground">Purchase Ref, Date, Supplier Name, Payment Type, Product SKU, Quantity, Unit Price, Notes</span>.
          <br />The <span className="font-medium text-foreground">Date</span> can be in the past (YYYY-MM-DD or DD/MM/YYYY). Payment Type is <span className="font-medium text-foreground">Cash</span> or <span className="font-medium text-foreground">From Deposit</span> (deducts the supplier deposit, needs enough balance). Unknown suppliers are created. Refs already imported are skipped.
          {canBackdate
            ? <> To change the date of an existing purchase, add a row with its <span className="font-medium text-foreground">Purchase Number</span> and the new Date.</>
            : <> Only the Owner and Admin can import backdated purchases or change purchase dates; your file must be dated today (leave Date empty).</>} Press OK to start.
        </>}
        onImport={runImport}
        onDone={load}
      />

      {/* New purchase */}
      <Dialog open={showPurchaseForm} onOpenChange={setShowPurchaseForm}>
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

            <div>
              <Label>Add Products</Label>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search products..." value={productSearch} onChange={e => setProductSearch(e.target.value)} className="pl-9" />
              </div>
              {productSearch && (
                <div className="max-h-32 overflow-y-auto border border-border rounded-lg">
                  {filteredProducts.slice(0, 10).map(p => (
                    <button key={p.id} onClick={() => { addToCart(p); setProductSearch(''); }} className="w-full text-left p-2 hover:bg-muted text-sm flex justify-between gap-2">
                      <span className="break-words whitespace-normal min-w-0">{p.productName} <span className="text-muted-foreground text-xs">({p.sku})</span></span>
                      <span className="text-muted-foreground shrink-0">{fmt(p.costPrice)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="space-y-2">
                {cart.map((item, i) => (
                  <div key={item.product.id} className="flex items-center gap-3 bg-muted/50 rounded-lg p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground break-words whitespace-normal">{item.product.productName}</p>
                    </div>
                    <Input type="number" value={item.quantity} onChange={e => setCart(cart.map((c, j) => j === i ? { ...c, quantity: Number(e.target.value) || 1 } : c))} className="w-16 h-8 text-center" />
                    <span className="text-xs text-muted-foreground">×</span>
                    <Input type="number" value={item.unitPrice} onChange={e => setCart(cart.map((c, j) => j === i ? { ...c, unitPrice: Number(e.target.value) || 0 } : c))} className="w-24 h-8" />
                    <span className="text-sm font-semibold w-24 text-right">{fmt(item.unitPrice * item.quantity)}</span>
                    <button onClick={() => setCart(cart.filter((_, j) => j !== i))}><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                  </div>
                ))}
                <div className="flex justify-end text-lg font-bold text-primary">Total: {fmt(cartTotal)}</div>
              </div>
            )}

            <div>
              <Label>Notes</Label>
              <Input value={pNotes} onChange={e => setPNotes(e.target.value)} placeholder="Optional notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPurchaseForm(false)}>Cancel</Button>
            <Button onClick={handleSavePurchase} disabled={savingPurchase}>{savingPurchase ? 'Saving...' : 'Record Purchase'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditEntryDialog open={!!editT} onOpenChange={o => { if (!o) setEditT(null); }} kind={editT?.kind || 'expense'} entry={editT?.entry || null} onSaved={load} />
      <DeleteEntryDialog open={!!delT} onOpenChange={o => { if (!o) setDelT(null); }} kind={delT?.kind || 'expense'} entry={delT?.entry || null} onDone={load} />

      {/* New other expense */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Other Expense</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Description *</Label><Input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="e.g. Rent, Electricity, Transport" /></div>
            <div><Label>Amount (KES) *</Label><Input type="number" value={formAmount} onChange={e => setFormAmount(e.target.value)} placeholder="0.00" /></div>
            <div><Label>Notes</Label><Input value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Optional notes" /></div>
            {canBackdate && <div><Label>Date</Label><DatePicker value={formDate} onChange={d => d && setFormDate(d)} /></div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
