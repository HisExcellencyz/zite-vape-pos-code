import { useState, useEffect } from 'react';
import { updateEntry, deleteEntry } from 'zitejs/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@project/components/ui/dialog';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Switch } from '@project/components/ui/switch';
import { DatePicker } from '@project/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { usePermissions } from '../hooks/usePermissions';

export type EntryKind = 'sale' | 'income' | 'purchase' | 'expense' | 'deduction';

const KIND_LABEL: Record<EntryKind, string> = {
  sale: 'Sale', income: 'Income', purchase: 'Purchase', expense: 'Expense', deduction: 'Deductions',
};
const DATE_FIELD: Record<EntryKind, string> = {
  sale: 'saleDate', income: 'incomeDate', purchase: 'purchaseDate', expense: 'expenseDate', deduction: 'saleDate',
};
const NUMBER_FIELD: Record<EntryKind, string> = {
  sale: 'saleNumber', income: 'incomeNumber', purchase: 'purchaseNumber', expense: 'expenseNumber', deduction: 'saleNumber',
};
const PAYMENTS = ['Platform Pay', 'Cash/M-PESA'];

/** Strips the "- Sale #n" link of revenues that belong to a sale, so only the revenue's own name is edited. */
const SALE_SUFFIX = /\s-\sSale\s#\d+$/;

/**
 * Edit dialog for entries on the Income and Expenses pages.
 * The calendar icon (backdate) is only shown to the Owner and Admin; the server enforces the same rule.
 */
export function EditEntryDialog({ open, onOpenChange, kind, entry, onSaved }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: EntryKind;
  entry: any | null;
  onSaved: () => void;
}) {
  const { canBackdate } = usePermissions();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [payment, setPayment] = useState('');
  const [date, setDate] = useState<Date | undefined>();
  const [rows, setRows] = useState<{ name: string; amount: string }[]>([]);
  const [saving, setSaving] = useState(false);

  const originalDate: Date | undefined = entry?.[DATE_FIELD[kind]] ? new Date(entry[DATE_FIELD[kind]]) : undefined;

  useEffect(() => {
    if (!open || !entry) return;
    setDescription(String(entry.description || '').replace(SALE_SUFFIX, ''));
    setAmount(entry.amount != null ? String(entry.amount) : '');
    setNotes(entry.notes || '');
    setPayment(PAYMENTS.includes(entry.paymentMethod) ? entry.paymentMethod : /cash|m-?pesa/i.test(entry.paymentMethod || '') ? 'Cash/M-PESA' : 'Platform Pay');
    setDate(entry[DATE_FIELD[kind]] ? new Date(entry[DATE_FIELD[kind]]) : undefined);
    let list: { name: string; amount: number }[] = [];
    try { list = entry.deductionDetails ? JSON.parse(entry.deductionDetails) : []; } catch {}
    setRows(list.map(d => ({ name: d.name, amount: String(d.amount) })));
  }, [open, entry, kind]);

  if (!entry) return null;

  const save = async () => {
    if ((kind === 'income' || kind === 'expense') && !description.trim()) return toast.error('Description is required');
    if ((kind === 'income' || kind === 'expense') && !(Number(amount) > 0)) return toast.error('Enter a valid amount');
    if (kind === 'deduction' && rows.some(r => !r.name.trim() || !(Number(r.amount) >= 0))) return toast.error('Each deduction needs a name and an amount');

    const dayChanged = canBackdate && !!date && !!originalDate && format(date, 'yyyy-MM-dd') !== format(originalDate, 'yyyy-MM-dd');
    setSaving(true);
    try {
      await updateEntry({
        kind,
        id: entry.id,
        date: dayChanged && date ? format(date, 'yyyy-MM-dd') : undefined,
        ...(kind === 'income' || kind === 'expense' ? { description: description.trim(), amount: Number(amount) } : {}),
        ...(kind !== 'deduction' ? { notes } : {}),
        ...(kind === 'sale' ? { paymentMethod: payment } : {}),
        ...(kind === 'deduction' ? { deductions: rows.map(r => ({ name: r.name.trim(), amount: Number(r.amount) || 0 })) } : {}),
      });
      toast.success(`${KIND_LABEL[kind]} updated`);
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const number = entry[NUMBER_FIELD[kind]];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {KIND_LABEL[kind]}{number != null ? ` #${number}` : ''}</DialogTitle>
          {kind === 'purchase' && (
            <DialogDescription className="text-xs">Items and totals can't be changed. To correct them, delete the purchase and record it again.</DialogDescription>
          )}
          {kind === 'sale' && (
            <DialogDescription className="text-xs">Items and totals can't be changed. Changing the date also moves the sale's delivery fee and revenues to that date.</DialogDescription>
          )}
        </DialogHeader>
        <div className="space-y-3">
          {(kind === 'income' || kind === 'expense') && (
            <>
              <div><Label>Description *</Label><Input value={description} onChange={e => setDescription(e.target.value)} /></div>
              <div><Label>Amount (KES) *</Label><Input type="number" value={amount} onChange={e => setAmount(e.target.value)} /></div>
            </>
          )}
          {kind === 'sale' && (
            <div>
              <Label>Payment</Label>
              <Select value={payment} onValueChange={setPayment}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENTS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {kind === 'deduction' && (
            <div className="space-y-2">
              <Label>Deductions on this sale</Label>
              {rows.map((r, i) => (
                <div key={i} className="flex gap-1.5">
                  <Input value={r.name} onChange={e => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Name" className="h-8 text-xs flex-1" />
                  <Input value={r.amount} type="number" onChange={e => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} placeholder="KES" className="h-8 text-xs w-24" />
                  <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-destructive" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => setRows([...rows, { name: '', amount: '' }])}><Plus className="w-3 h-3 mr-1" /> Add deduction</Button>
              <p className="text-[11px] text-muted-foreground">Total: KES {rows.reduce((s, r) => s + (Number(r.amount) || 0), 0).toLocaleString()}</p>
            </div>
          )}
          {kind !== 'deduction' && (
            <div><Label>Notes</Label><Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" /></div>
          )}
          <div>
            <Label>Date</Label>
            {canBackdate ? (
              <DatePicker value={date} onChange={d => d && setDate(d)} placeholder="Backdate this entry" />
            ) : (
              <p className="text-sm text-muted-foreground">{originalDate ? format(originalDate, 'dd MMM yyyy HH:mm') : '-'}</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Confirmation dialog for deleting an entry. Sales and purchases can optionally correct stock. */
export function DeleteEntryDialog({ open, onOpenChange, kind, entry, onDone }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: EntryKind;
  entry: any | null;
  onDone: () => void;
}) {
  const [adjust, setAdjust] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setAdjust(true); }, [open]);
  if (!entry) return null;

  const number = entry[NUMBER_FIELD[kind]];
  const what = kind === 'deduction' ? `the deductions on sale #${number}` : `${KIND_LABEL[kind].toLowerCase()} #${number}`;
  const extra =
    kind === 'sale' ? "This also removes the sale's delivery fee / revenues."
    : kind === 'purchase' ? (entry.paymentType === 'From Deposit' ? 'The amount is refunded to the supplier deposit.' : '')
    : kind === 'deduction' ? 'The sale itself is kept; only its deductions are cleared.'
    : '';

  const confirm = async () => {
    setBusy(true);
    try {
      await deleteEntry({ kind, id: entry.id, adjustStock: kind === 'sale' || kind === 'purchase' ? adjust : undefined });
      toast.success(kind === 'deduction' ? 'Deductions cleared' : `${KIND_LABEL[kind]} deleted`);
      onOpenChange(false);
      onDone();
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{kind === 'deduction' ? 'Clear deductions?' : `Delete ${KIND_LABEL[kind].toLowerCase()}?`}</DialogTitle>
          <DialogDescription className="text-xs">This will {kind === 'deduction' ? 'clear' : 'permanently delete'} {what}. {extra} This cannot be undone.</DialogDescription>
        </DialogHeader>
        {(kind === 'sale' || kind === 'purchase') && (
          <div className="flex items-center gap-2">
            <Switch id="adj-stock" checked={adjust} onCheckedChange={setAdjust} />
            <Label htmlFor="adj-stock" className="text-xs">
              {kind === 'sale' ? 'Put the sold items back in stock' : 'Take the purchased items out of stock'}
            </Label>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={confirm} disabled={busy}>{busy ? 'Working...' : kind === 'deduction' ? 'Clear' : 'Delete'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
