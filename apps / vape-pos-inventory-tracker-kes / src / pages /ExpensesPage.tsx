import { useState, useEffect } from 'react';
import { getExpenses, getPurchases, createExpense, exportCsv } from 'zitejs/api';
import { Card, CardContent } from '@project/components/ui/card';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Badge } from '@project/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@project/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@project/components/ui/dialog';
import { Plus, Download, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { downloadCsv } from '../lib/exportHelper';
import ViewToggle, { useViewMode } from '../components/ViewToggle';

interface Expense { id: string; expenseNumber?: number; expenseDate?: string; description?: string; amount?: number; notes?: string; }
interface Purchase { id: string; purchaseNumber?: number; purchaseDate?: string; total?: number; paymentType?: string; }

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formDesc, setFormDesc] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useViewMode('expenses', 'list');

  const load = async () => {
    setLoading(true);
    try {
      const [e, p] = await Promise.all([getExpenses({}), getPurchases({})]);
      setExpenses(e.expenses as Expense[]);
      setPurchases(p.purchases as Purchase[]);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!formDesc) return toast.error('Description is required');
    if (!formAmount || Number(formAmount) <= 0) return toast.error('Valid amount is required');
    setSaving(true);
    try {
      await createExpense({ description: formDesc, amount: Number(formAmount), notes: formNotes || undefined });
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
  const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const totalPurchases = purchases.reduce((s, p) => s + (p.total || 0), 0);

  const paymentBadge = (p: Purchase) => (
    <Badge variant="secondary" className={p.paymentType === 'From Deposit' ? 'bg-primary/10 text-primary' : 'bg-emerald-500/10 text-emerald-400'}>
      {p.paymentType}
    </Badge>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Expenses</h1>
          <p className="text-sm text-muted-foreground">Total: {fmt(totalExpenses + totalPurchases)}</p>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle value={viewMode} onChange={setViewMode} />
          <Button variant="outline" size="sm" className="border-pink-500 text-pink-400 hover:bg-pink-500/10" onClick={() => handleExport('expenses')}><Download className="w-4 h-4 mr-1" /> Export</Button>
          <Button size="sm" onClick={() => setShowForm(true)}><Plus className="w-4 h-4 mr-1" /> Add Expense</Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground uppercase">Purchases</p>
            <p className="text-xl font-bold text-foreground mt-1 break-words">{fmt(totalPurchases)}</p>
            <p className="text-xs text-muted-foreground">{purchases.length} records</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground uppercase">Other Expenses</p>
            <p className="text-xl font-bold text-foreground mt-1 break-words">{fmt(totalExpenses)}</p>
            <p className="text-xs text-muted-foreground">{expenses.length} records</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground uppercase">Grand Total</p>
            <p className="text-xl font-bold text-secondary mt-1 break-words">{fmt(totalExpenses + totalPurchases)}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="purchases">
        <TabsList className="bg-muted">
          <TabsTrigger value="purchases">Purchases ({purchases.length})</TabsTrigger>
          <TabsTrigger value="other">Other Expenses ({expenses.length})</TabsTrigger>
        </TabsList>

        {/* Purchases tab */}
        <TabsContent value="purchases" className="mt-4">
          {viewMode === 'list' ? (
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
                      </tr>
                    </thead>
                    <tbody>
                      {purchases.length === 0 ? (
                        <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">No purchases</td></tr>
                      ) : purchases.map(p => (
                        <tr key={p.id} className="border-b border-border hover:bg-muted/30">
                          <td className="p-3 font-mono text-xs text-muted-foreground">#{p.purchaseNumber}</td>
                          <td className="p-3 text-foreground">{p.purchaseDate ? format(new Date(p.purchaseDate), 'dd MMM yyyy') : '-'}</td>
                          <td className="p-3">{paymentBadge(p)}</td>
                          <td className="p-3 text-right font-semibold whitespace-nowrap">{fmt(p.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {purchases.length === 0 ? (
                <Card className="col-span-full bg-card border-border"><CardContent className="py-8 text-center text-muted-foreground">No purchases</CardContent></Card>
              ) : purchases.map(p => (
                <Card key={p.id} className="bg-card border-border">
                  <CardContent className="p-4 space-y-3">
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
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Other expenses tab */}
        <TabsContent value="other" className="mt-4">
          {viewMode === 'list' ? (
            <Card className="bg-card border-border">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="text-left p-3 font-medium">#</th>
                        <th className="text-left p-3 font-medium">Date</th>
                        <th className="text-left p-3 font-medium">Description</th>
                        <th className="text-right p-3 font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenses.length === 0 ? (
                        <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">No expenses</td></tr>
                      ) : expenses.map(e => (
                        <tr key={e.id} className="border-b border-border hover:bg-muted/30">
                          <td className="p-3 font-mono text-xs text-muted-foreground">#{e.expenseNumber}</td>
                          <td className="p-3 text-foreground">{e.expenseDate ? format(new Date(e.expenseDate), 'dd MMM yyyy') : '-'}</td>
                          <td className="p-3 text-foreground break-words whitespace-normal max-w-md">{e.description}</td>
                          <td className="p-3 text-right font-semibold whitespace-nowrap">{fmt(e.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {expenses.length === 0 ? (
                <Card className="col-span-full bg-card border-border"><CardContent className="py-8 text-center text-muted-foreground">No expenses</CardContent></Card>
              ) : expenses.map(e => (
                <Card key={e.id} className="bg-card border-border">
                  <CardContent className="p-4 space-y-3">
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
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* New Expense Dialog */}
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
