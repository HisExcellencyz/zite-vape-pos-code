import { useEffect, useState } from 'react';
import { managePettyCash, manageSupplierBills } from 'zitejs/api';
import { Card, CardContent } from '@project/components/ui/card';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Badge } from '@project/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@project/components/ui/dialog';
import { DatePicker } from '@project/components/ui/date-picker';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@project/components/ui/alert-dialog';
import { ArrowDownCircle, ArrowUpCircle, FileText, PiggyBank, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import SummaryTiles from './SummaryTiles';
import { usePermissions } from '../hooks/usePermissions';
import { Field, SubmitButton, DESTRUCTIVE } from './DialogKit';

interface Entry { id: string; entryNumber?: number; entryDate?: string; type?: string; amount?: number; description?: string; notes?: string; runningBalance: number }
interface Bill { id: string; supplierId: string; amount: number; notes?: string | null; date: string; status: 'pending' | 'paid'; source: 'manual' | 'pickup'; items?: { name: string; quantity: number }[] }

const fmt = (n?: number) => `KES ${(n || 0).toLocaleString()}`;
const day = (d?: string) => (d ? format(new Date(d), 'dd MMM yyyy') : '-');

/** Petty cash for one outlet: balance, top-ups and withdrawals, and paying supplier bills from it. */
export default function PettyCashPanel({ branchId, branchName, suppliers }: { branchId?: string; branchName?: string; suppliers: { id: string; supplierName?: string }[] }) {
  const { can, canBackdate } = usePermissions();
  const [balance, setBalance] = useState(0);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'topup' | 'withdraw' | null>(null);
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState<Date | undefined>(new Date());

  const supplierName = (id: string) => suppliers.find(s => s.id === id)?.supplierName || 'Supplier';
  const canCreate = can('expenses', 'create');
  const canDelete = can('expenses', 'delete');

  const load = async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const [pc, b] = await Promise.all([
        managePettyCash({ action: 'list', branchId }),
        manageSupplierBills({ action: 'list' }),
      ]);
      setBalance(pc.balance);
      setEntries(pc.entries as Entry[]);
      setBills((b.bills as Bill[]).filter(x => x.status === 'pending'));
    } catch (e: any) { toast.error(e.message || 'Could not load petty cash'); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [branchId]);

  const openForm = (m: 'topup' | 'withdraw') => { setMode(m); setAmount(''); setDesc(''); setNotes(''); setDate(new Date()); };

  const save = async () => {
    if (!branchId || !mode) return;
    const n = Number(amount);
    if (!(n > 0)) return toast.error('Enter an amount greater than 0');
    setBusy(true);
    try {
      await managePettyCash({ action: mode, branchId, amount: n, description: desc || undefined, notes: notes || undefined, date: date?.toISOString() });
      toast.success(mode === 'topup' ? 'Petty cash topped up' : 'Withdrawal recorded');
      setMode(null);
      await load();
    } catch (e: any) { toast.error(e.message || 'Failed'); } finally { setBusy(false); }
  };

  const payBill = async (b: Bill) => {
    if (!branchId) return;
    setBusy(true);
    try {
      await manageSupplierBills({ action: 'pay', billId: b.id, fromPettyCash: true, pettyCashBranchId: branchId });
      toast.success(`Paid ${fmt(b.amount)} to ${supplierName(b.supplierId)} from petty cash`);
      await load();
    } catch (e: any) { toast.error(e.message || 'Failed'); } finally { setBusy(false); }
  };

  const remove = async (e: Entry) => {
    if (!branchId) return;
    try {
      await managePettyCash({ action: 'delete', branchId, entryId: e.id });
      toast.success('Entry deleted');
      await load();
    } catch (err: any) { toast.error(err.message || 'Failed'); }
  };

  if (!branchId) return <p className="text-sm text-muted-foreground py-8 text-center">Choose an outlet to see its petty cash.</p>;

  const topUps = entries.filter(e => e.type === 'Top Up').reduce((s, e) => s + (e.amount || 0), 0);
  const billsPaid = -entries.filter(e => e.type === 'Bill Payment').reduce((s, e) => s + (e.amount || 0), 0);
  const pendingTotal = bills.reduce((s, b) => s + b.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <PiggyBank className="w-4 h-4" /> Petty cash for <span className="font-semibold text-foreground">{branchName || 'this outlet'}</span>
        </div>
        {canCreate && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => openForm('withdraw')}><ArrowUpCircle className="w-4 h-4 mr-1" /> Withdraw</Button>
            <Button size="sm" onClick={() => openForm('topup')}><ArrowDownCircle className="w-4 h-4 mr-1" /> Top Up</Button>
          </div>
        )}
      </div>

      <SummaryTiles items={[
        { label: 'Petty Cash Balance', value: fmt(balance) },
        { label: 'Total Top-ups', value: fmt(topUps) },
        { label: 'Bills Paid', value: fmt(billsPaid) },
        { label: 'Bills Pending', value: fmt(pendingTotal) },
      ]} />

      <Card className="bg-card border-border"><CardContent className="p-4 space-y-2">
        <h3 className="text-sm font-semibold">Supplier bills to pay</h3>
        {loading && bills.length === 0 ? <p className="text-sm text-muted-foreground py-3">Loading...</p>
          : bills.length === 0 ? <p className="text-sm text-muted-foreground py-3">No pending supplier bills.</p>
          : bills.map(b => (
            <div key={b.id} className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-foreground flex items-center gap-1.5 flex-wrap">
                  <FileText className="w-3.5 h-3.5" /> {supplierName(b.supplierId)}
                  <span className="text-xs text-muted-foreground font-normal">· {day(b.date)}</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{b.source === 'pickup' ? 'POS pick-up' : 'Manual'}</Badge>
                </p>
                {(b.notes || b.items?.length) ? (
                  <p className="text-xs text-muted-foreground break-words">{b.notes || b.items!.map(i => `${i.quantity}× ${i.name}`).join(', ')}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-bold">{fmt(b.amount)}</span>
                {canCreate && (
                  <Button size="sm" className="h-7 text-xs" disabled={busy || balance < b.amount} title={balance < b.amount ? 'Not enough petty cash' : 'Pay from petty cash'} onClick={() => payBill(b)}>
                    Pay from petty cash
                  </Button>
                )}
              </div>
            </div>
          ))}
      </CardContent></Card>

      <Card className="bg-card border-border"><CardContent className="p-0"><div className="overflow-auto max-h-[60vh]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-card"><tr className="border-b border-border text-muted-foreground bg-card">
            <th className="p-3 text-left">#</th>
            <th className="p-3 text-left">Date</th>
            <th className="p-3 text-left">Type</th>
            <th className="p-3 text-left">Description</th>
            <th className="p-3 text-right">Amount</th>
            <th className="p-3 text-right">Balance</th>
            {canDelete && <th className="p-3 w-12" />}
          </tr></thead>
          <tbody>
            {entries.length === 0 ? (
              <tr><td colSpan={canDelete ? 7 : 6} className="text-center py-12 text-muted-foreground"><PiggyBank className="w-10 h-10 mx-auto mb-2 opacity-40" />{loading ? 'Loading...' : 'No petty cash entries yet. Top up to start.'}</td></tr>
            ) : entries.map(e => {
              const inflow = (e.amount || 0) > 0;
              return (
                <tr key={e.id} className="border-b border-border hover:bg-muted/30">
                  <td className="p-3 font-mono text-xs text-muted-foreground">#{e.entryNumber}</td>
                  <td className="p-3 whitespace-nowrap">{day(e.entryDate)}</td>
                  <td className="p-3"><Badge variant="secondary" className={inflow ? 'bg-emerald-500/10 text-emerald-400' : e.type === 'Bill Payment' ? 'bg-pink-500/10 text-pink-400' : 'bg-amber-500/10 text-amber-400'}>{e.type}</Badge></td>
                  <td className="p-3 break-words whitespace-normal max-w-md">{e.description}{e.notes ? <span className="block text-xs text-muted-foreground">{e.notes}</span> : null}</td>
                  <td className={`p-3 text-right font-semibold whitespace-nowrap ${inflow ? 'text-emerald-400' : 'text-pink-400'}`}>{inflow ? '+' : '-'}{fmt(Math.abs(e.amount || 0))}</td>
                  <td className="p-3 text-right whitespace-nowrap text-muted-foreground">{fmt(e.runningBalance)}</td>
                  {canDelete && (
                    <td className="p-3 text-right">
                      {e.type !== 'Bill Payment' && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" title="Delete"><Trash2 className="w-3.5 h-3.5" /></Button></AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Delete this entry?</AlertDialogTitle><AlertDialogDescription>The petty cash balance will be recalculated without it.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className={DESTRUCTIVE} onClick={() => remove(e)}>Delete</AlertDialogAction></AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div></CardContent></Card>

      <Dialog open={mode !== null} onOpenChange={o => !o && setMode(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{mode === 'topup' ? 'Top up petty cash' : 'Withdraw from petty cash'}</DialogTitle>
            <DialogDescription>{branchName || 'This outlet'} · current balance {fmt(balance)}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (KES)" required className={canBackdate ? '' : 'col-span-2'}
              error={amount !== '' && !(Number(amount) > 0) ? 'Amount must be more than 0' : ''}>
              <Input type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)} autoFocus />
            </Field>
            {canBackdate && <Field label="Date"><DatePicker value={date} onChange={d => d && setDate(d)} /></Field>}
            <Field label="Description" className="col-span-2">
              <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder={mode === 'topup' ? 'e.g. Cash from till' : 'e.g. Returned to owner'} />
            </Field>
            <Field label="Notes" className="col-span-2"><Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)}>Cancel</Button>
            <SubmitButton busy={busy} disabled={!(Number(amount) > 0)} onClick={save}>{mode === 'topup' ? 'Top Up' : 'Withdraw'}</SubmitButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
