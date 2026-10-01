import { useState, useEffect } from 'react';
import { getExpenses, getPurchases, getIncome, createExpense, exportCsv } from 'zitejs/api';
import { Card, CardContent } from '@project/components/ui/card';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Badge } from '@project/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@project/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@project/components/ui/dialog';
import { Plus, Download, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { downloadCsv } from '../lib/exportHelper';
import ViewToggle, { useViewMode } from '../components/ViewToggle';
import OtherIncomeDialog from '../components/OtherIncomeDialog';
import { useBranch } from '../hooks/useBranch';
import { useTableControls, TableControls, SortTh, FieldDef } from '../components/TableControls';
import DateRangeFilter, { Range, inRange } from '../components/DateRangeFilter';
import SummaryTiles from '../components/SummaryTiles';

interface Expense { id: string; expenseNumber?: number; expenseDate?: string; description?: string; amount?: number; notes?: string; }
interface Purchase { id: string; purchaseNumber?: number; purchaseDate?: string; total?: number; paymentType?: string; }
interface Income { id: string; incomeNumber?: number; incomeDate?: string; description?: string; amount?: number; notes?: string; }

const PF: FieldDef<Purchase>[] = [
  { key: 'purchaseNumber', label: '#' }, { key: 'purchaseDate', label: 'Date' }, { key: 'paymentType', label: 'Payment' }, { key: 'total', label: 'Total' },
];
const EF: FieldDef<Expense>[] = [
  { key: 'expenseNumber', label: '#' }, { key: 'expenseDate', label: 'Date' }, { key: 'description', label: 'Description' }, { key: 'amount', label: 'Amount' }, { key: 'notes', label: 'Notes' },
];
const IF: FieldDef<Income>[] = [
  { key: 'incomeNumber', label: '#' }, { key: 'incomeDate', label: 'Date' }, { key: 'description', label: 'Description' }, { key: 'amount', label: 'Amount' }, { key: 'notes', label: 'Notes' },
];

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [income, setIncome] = useState<Income[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showIncome, setShowIncome] = useState(false);
  const [tab, setTab] = useState('purchases');
  const [formDesc, setFormDesc] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useViewMode('expenses', 'list');
  const { currentBranch } = useBranch();
  const [range, setRange] = useState<Range>({});
  const dP = purchases.filter(x => inRange(range, x.purchaseDate));
  const dE = expenses.filter(x => inRange(range, x.expenseDate));
  const dI = income.filter(x => inRange(range, x.incomeDate));
  const tcP = useTableControls(dP, PF);
  const tcE = useTableControls(dE, EF);
  const tcI = useTableControls(dI, IF);

  const load = async () => {
    setLoading(true);
    try {
      const [e, p, i] = await Promise.all([getExpenses({ branchId: currentBranch?.id }), getPurchases({ branchId: currentBranch?.id }), getIncome({ branchId: currentBranch?.id })]);
      setExpenses(e.expenses as Expense[]);
      setPurchases(p.purchases as Purchase[]);
      setIncome(i.income as Income[]);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [currentBranch?.id]);

  const handleSave = async () => {
    if (!formDesc) return toast.error('Description is required');
    if (!formAmount || Number(formAmount) <= 0) return toast.error('Valid amount is required');
    setSaving(true);
    try {
      await createExpense({ description: formDesc, amount: Number(formAmount), notes: formNotes || undefined, branchId: currentBranch?.id });
      toast.success('Expense recorded');
      setShowForm(false); setFormDesc(''); setFormAmount(''); setFormNotes('');
      load();
    } catch (e: any) { toast.error(e.message || 'Failed'); } finally { setSaving(false); }
  };

  const handleExport = async (table: 'expenses' | 'purchases') => {
    try {
      const res = await exportCsv({ table });
      downloadCsv(res.csv, res.filename);
      toast.success('Exported');
    } catch { toast.error('Export failed'); }
  };

  const fmt = (n?: number) => `KES ${(n || 0).toLocaleString()}`;
  const totalExpenses = dE.reduce((s, e) => s + (e.amount || 0), 0);
  const totalPurchases = dP.reduce((s, p) => s + (p.total || 0), 0);
  const totalIncome = dI.reduce((s, i) => s + (i.amount || 0), 0);

  const paymentBadge = (p: Purchase) => (
    <Badge variant="secondary" className={p.paymentType === 'From Deposit' ? 'bg-primary/10 text-primary' : 'bg-emerald-500/10 text-emerald-400'}>
      {p.paymentType}
    </Badge>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="sticky top-0 z-20 -mx-6 -mt-6 px-6 pt-6 pb-4 space-y-4 bg-background/95 backdrop-blur border-b border-border">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Expenses</h1>
          <p className="text-sm text-muted-foreground">Total: {fmt(totalExpenses + totalPurchases)}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ViewToggle value={viewMode} onChange={setViewMode} />
          <Button variant="outline" size="sm" className="border-pink-500 text-pink-400 hover:bg-pink-500/10" onClick={() => handleExport('expenses')}><Download className="w-4 h-4 mr-1" /> Export</Button>
          <Button variant="outline" size="sm" className="border-emerald-500 text-emerald-400 hover:bg-emerald-500/10" onClick={() => setShowIncome(true)}><TrendingUp className="w-4 h-4 mr-1" /> Add Other Income</Button>
          <Button size="sm" onClick={() => setShowForm(true)}><Plus className="w-4 h-4 mr-1" /> Add Expense</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <DateRangeFilter value={range} onChange={setRange} />
        <TableControls c={(tab === 'purchases' ? tcP : tab === 'other' ? tcE : tcI) as any} />
      </div>
      <SummaryTiles items={[
        { label: 'Purchases', value: fmt(totalPurchases), sub: `${dP.length} records` },
        { label: 'Other Expenses', value: fmt(totalExpenses), sub: `${dE.length} records` },
        { label: 'Grand Total', value: fmt(totalExpenses + totalPurchases) },
        { label: 'Other Income', value: fmt(totalIncome), sub: `${dI.length} records` },
      ]} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted">
          <TabsTrigger value="purchases">Purchases ({dP.length})</TabsTrigger>
          <TabsTrigger value="other">Other Expenses ({dE.length})</TabsTrigger>
          <TabsTrigger value="income">Other Income ({dI.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="purchases" className="mt-4">
          {viewMode === 'list' ? (
            <Card className="bg-card border-border"><CardContent className="p-0"><div className="overflow-auto max-h-[65vh]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-card"><tr className="border-b border-border text-muted-foreground bg-card">
                  <SortTh c={tcP} k="purchaseNumber" className="text-left">#</SortTh>
                  <SortTh c={tcP} k="purchaseDate" className="text-left">Date</SortTh>
                  <SortTh c={tcP} k="paymentType" className="text-left">Payment</SortTh>
                  <SortTh c={tcP} k="total" className="text-right">Total</SortTh>
                </tr></thead>
                <tbody>
                  {tcP.view.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">{loading ? 'Loading...' : 'No purchases'}</td></tr>
                  ) : tcP.view.map(p => (
                    <tr key={p.id} className="border-b border-border hover:bg-muted/30">
                      <td className="p-3 font-mono text-xs text-muted-foreground">#{p.purchaseNumber}</td>
                      <td className="p-3 text-foreground">{p.purchaseDate ? format(new Date(p.purchaseDate), 'dd MMM yyyy') : '-'}</td>
                      <td className="p-3">{paymentBadge(p)}</td>
                      <td className="p-3 text-right font-semibold whitespace-nowrap">{fmt(p.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div></CardContent></Card>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {tcP.view.length === 0 ? (
                <Card className="col-span-full bg-card border-border"><CardContent className="py-8 text-center text-muted-foreground">No purchases</CardContent></Card>
              ) : tcP.view.map(p => (
                <Card key={p.id} className="bg-card border-border"><CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold text-foreground">#{p.purchaseNumber}</p>
                      <p className="text-xs text-muted-foreground">{p.purchaseDate ? format(new Date(p.purchaseDate), 'dd MMM yyyy') : '-'}</p>
                    </div>
                    <div className="shrink-0">{paymentBadge(p)}</div>
                  </div>
                  <div className="border-t border-border pt-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Total</span>
                    <span className="text-lg font-bold text-primary break-words text-right">{fmt(p.total)}</span>
                  </div>
                </CardContent></Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="other" className="mt-4">
          {viewMode === 'list' ? (
            <Card className="bg-card border-border"><CardContent className="p-0"><div className="overflow-auto max-h-[65vh]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-card"><tr className="border-b border-border text-muted-foreground bg-card">
                  <SortTh c={tcE} k="expenseNumber" className="text-left">#</SortTh>
                  <SortTh c={tcE} k="expenseDate" className="text-left">Date</SortTh>
                  <SortTh c={tcE} k="description" className="text-left">Description</SortTh>
                  <SortTh c={tcE} k="amount" className="text-right">Amount</SortTh>
                </tr></thead>
                <tbody>
                  {tcE.view.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">No expenses</td></tr>
                  ) : tcE.view.map(e => (
                    <tr key={e.id} className="border-b border-border hover:bg-muted/30">
                      <td className="p-3 font-mono text-xs text-muted-foreground">#{e.expenseNumber}</td>
                      <td className="p-3 text-foreground">{e.expenseDate ? format(new Date(e.expenseDate), 'dd MMM yyyy') : '-'}</td>
                      <td className="p-3 text-foreground break-words whitespace-normal max-w-md">{e.description}</td>
                      <td className="p-3 text-right font-semibold whitespace-nowrap">{fmt(e.amount)}</td>
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
                </CardContent></Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="income" className="mt-4">
          {viewMode === 'list' ? (
            <Card className="bg-card border-border"><CardContent className="p-0"><div className="overflow-auto max-h-[65vh]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-card"><tr className="border-b border-border text-muted-foreground bg-card">
                  <SortTh c={tcI} k="incomeNumber" className="text-left">#</SortTh>
                  <SortTh c={tcI} k="incomeDate" className="text-left">Date</SortTh>
                  <SortTh c={tcI} k="description" className="text-left">Description</SortTh>
                  <SortTh c={tcI} k="amount" className="text-right">Amount</SortTh>
                </tr></thead>
                <tbody>
                  {tcI.view.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">No other income recorded</td></tr>
                  ) : tcI.view.map(i => (
                    <tr key={i.id} className="border-b border-border hover:bg-muted/30">
                      <td className="p-3 font-mono text-xs text-muted-foreground">#{i.incomeNumber}</td>
                      <td className="p-3 text-foreground">{i.incomeDate ? format(new Date(i.incomeDate), 'dd MMM yyyy') : '-'}</td>
                      <td className="p-3 text-foreground break-words whitespace-normal max-w-md">{i.description}{i.notes ? <span className="block text-xs text-muted-foreground">{i.notes}</span> : null}</td>
                      <td className="p-3 text-right font-semibold text-emerald-400 whitespace-nowrap">{fmt(i.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div></CardContent></Card>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {tcI.view.length === 0 ? (
                <Card className="col-span-full bg-card border-border"><CardContent className="py-8 text-center text-muted-foreground">No other income recorded</CardContent></Card>
              ) : tcI.view.map(i => (
                <Card key={i.id} className="bg-card border-border"><CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-mono text-sm font-semibold text-foreground">#{i.incomeNumber}</p>
                    <p className="text-xs text-muted-foreground">{i.incomeDate ? format(new Date(i.incomeDate), 'dd MMM yyyy') : '-'}</p>
                  </div>
                  <p className="text-sm text-foreground break-words whitespace-normal">{i.description}</p>
                  {i.notes && <p className="text-xs text-muted-foreground break-words whitespace-normal">{i.notes}</p>}
                  <div className="border-t border-border pt-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Amount</span>
                    <span className="text-lg font-bold text-emerald-400 break-words text-right">{fmt(i.amount)}</span>
                  </div>
                </CardContent></Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <OtherIncomeDialog open={showIncome} onOpenChange={setShowIncome} onSaved={() => { setTab('income'); load(); }} />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Other Expense</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Description *</Label><Input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="e.g. Rent, Electricity, Transport" /></div>
            <div><Label>Amount (KES) *</Label><Input type="number" value={formAmount} onChange={e => setFormAmount(e.target.value)} placeholder="0.00" /></div>
            <div><Label>Notes</Label><Input value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Optional notes" /></div>
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
