import { useState, useEffect } from 'react';
import { createIncome } from 'zitejs/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@project/components/ui/dialog';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { DatePicker } from '@project/components/ui/date-picker';
import { toast } from 'sonner';
import { useBranch } from '../hooks/useBranch';
import { usePermissions } from '../hooks/usePermissions';
import { Field, SubmitButton } from './DialogKit';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

function isToday(d: Date) {
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

export default function OtherIncomeDialog({ open, onOpenChange, onSaved }: Props) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [saving, setSaving] = useState(false);
  const { currentBranch } = useBranch();
  const { canBackdate } = usePermissions();

  useEffect(() => {
    if (open) {
      setDescription(''); setAmount(''); setNotes(''); setDate(new Date());
    }
  }, [open]);

  const amountError = amount !== '' && !(Number(amount) > 0) ? 'Amount must be more than 0' : '';
  const valid = !!description.trim() && Number(amount) > 0;

  const handleSave = async () => {
    if (!description.trim()) return toast.error('Description is required');
    if (!amount || Number(amount) <= 0) return toast.error('Enter a valid amount');
    setSaving(true);
    try {
      let when = canBackdate ? (date || new Date()) : new Date();
      if (!isToday(when)) {
        when = new Date(when);
        when.setHours(12, 0, 0, 0); // backdated entries: keep the chosen calendar day
      } else {
        when = new Date();
      }
      await createIncome({
        description: description.trim(),
        amount: Number(amount),
        notes: notes.trim() || undefined,
        date: when.toISOString(),
        branchId: currentBranch?.id,
      });
      toast.success('Other income recorded');
      onOpenChange(false);
      onSaved?.();
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Other Income</DialogTitle>
          <DialogDescription>Money received that is not a product sale, e.g. commissions, refunds from suppliers or rent received.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Description" required className="col-span-2">
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Supplier refund" />
          </Field>
          <Field label="Amount (KES)" required error={amountError} className={canBackdate ? '' : 'col-span-2'}>
            <Input type="number" min={0} value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
          </Field>
          {canBackdate && (
            <Field label="Date">
              <DatePicker value={date} onChange={setDate} />
            </Field>
          )}
          <Field label="Notes" className="col-span-2">
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <SubmitButton onClick={handleSave} busy={saving} disabled={!valid}>Save</SubmitButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
