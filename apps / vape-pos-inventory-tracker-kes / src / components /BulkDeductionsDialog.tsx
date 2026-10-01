import { useState } from 'react';
import { applySaleDeductions } from 'zitejs/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@project/components/ui/dialog';
import { Button } from '@project/components/ui/button';
import { Switch } from '@project/components/ui/switch';
import { Label } from '@project/components/ui/label';
import { toast } from 'sonner';
import DeductionsPicker from './DeductionsPicker';
import { Commission } from '../hooks/useBranch';

export default function BulkDeductionsDialog({ open, onOpenChange, saleIds, presets, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void; saleIds: string[]; presets: Commission[]; onDone: () => void;
}) {
  const [selected, setSelected] = useState<Commission[]>([]);
  const [replace, setReplace] = useState(false);
  const [saving, setSaving] = useState(false);

  const apply = async () => {
    setSaving(true);
    try {
      const res = await applySaleDeductions({ saleIds, deductions: selected, mode: replace ? 'replace' : 'add' });
      toast.success(`Deductions applied to ${res.updated} sale(s)`);
      setSelected([]);
      onOpenChange(false);
      onDone();
    } catch (e: any) {
      toast.error(e.message || 'Failed to apply deductions');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Apply deductions to {saleIds.length} sale(s)</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">Percentages are calculated on each sale's total.</p>
        <DeductionsPicker presets={presets} selected={selected} onChange={setSelected} base={0} />
        <div className="flex items-center gap-2">
          <Switch id="replace" checked={replace} onCheckedChange={setReplace} />
          <Label htmlFor="replace" className="text-xs">Replace existing deductions (otherwise add to them)</Label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={apply} disabled={saving || (!replace && selected.length === 0)}>{saving ? 'Applying...' : 'Apply'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
