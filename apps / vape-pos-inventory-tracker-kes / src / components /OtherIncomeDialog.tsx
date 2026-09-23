import { useState, useEffect } from 'react';
import { createIncome } from 'zitejs/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@project/components/ui/dialog';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { DatePicker } from '@project/components/ui/date-picker';
import { toast } from 'sonner';

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

  useEffect(() => {
    if (open) {
      setDescription(''); setAmount(''); setNotes(''); setDate(new Date());
    }
  }, [open]);

  const handleSave = async () => {
    if (!description.trim()) return toast.error('Description is required');
    if (!amount || Number(amount) <= 0) return toast.error('Enter a valid amount');
    setSaving(true);
    try {
      let when = date || new Date();
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
        <DialogHeader><DialogTitle>New Other Income</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Money received that is not a product sale, e.g. commissions, refunds from suppliers or rent received.
          </p>
          <div>
            <Label>Description *</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Supplier refund" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount (KES) *</Label>
              <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>Date</Label>
              <DatePicker value={date} onChange={setDate} />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
