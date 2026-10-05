import { useState } from 'react';
import { applySaleRevenues } from 'zitejs/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@project/components/ui/dialog';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Switch } from '@project/components/ui/switch';
import { Label } from '@project/components/ui/label';
import { Plus, X, Percent } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@project/components/lib/utils';
import { Commission } from '../hooks/useBranch';

const label = (c: Commission) => `${c.name} · ${c.type === 'percent' ? `${c.value}%` : `KES ${c.value}`}`;

/** Bulk-assign revenues (e.g. the Delivery Fee) to the selected sales, the same way deductions are assigned. */
export default function BulkRevenuesDialog({ open, onOpenChange, saleIds, presets, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void; saleIds: string[]; presets: Commission[]; onDone: () => void;
}) {
  const [selected, setSelected] = useState<Commission[]>([]);
  const [replace, setReplace] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [type, setType] = useState<'percent' | 'fixed'>('fixed');

  const isOn = (c: Commission) => selected.some(s => s.name === c.name);
  const toggle = (c: Commission) =>
    setSelected(isOn(c) ? selected.filter(s => s.name !== c.name) : [...selected, { name: c.name, type: c.type, value: c.value }]);
  const custom = selected.filter(s => !presets.some(p => p.name === s.name));

  const addCustom = () => {
    const v = Number(value);
    if (!name.trim() || !(v > 0)) return;
    setSelected([...selected.filter(s => s.name !== name.trim()), { name: name.trim(), type, value: v }]);
    setName(''); setValue('');
  };

  const apply = async () => {
    setSaving(true);
    try {
      const res = await applySaleRevenues({
        saleIds,
        revenues: selected.map(s => ({ name: s.name, type: s.type, value: s.value })),
        mode: replace ? 'replace' : 'add',
      });
      toast.success(`Revenues applied to ${saleIds.length - res.skipped} sale(s): ${res.created} added, ${res.updated} updated${res.removed ? `, ${res.removed} replaced` : ''}${res.skipped ? ` (${res.skipped} skipped)` : ''}`);
      setSelected([]);
      onOpenChange(false);
      onDone();
    } catch (e: any) {
      toast.error(e.message || 'Failed to apply revenues');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Apply revenues to {saleIds.length} sale(s)</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">
          Revenues such as the Delivery Fee are added as income against each sale. Percentages are calculated on each sale's total. If a sale already has the same revenue, its amount is updated instead of duplicated.
        </p>
        <div className="space-y-2">
          {presets.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {presets.map(c => (
                <button key={c.name} type="button" onClick={() => toggle(c)}
                  className={cn('text-[11px] px-2 py-1 rounded-full border transition-all',
                    isOn(c) ? 'border-emerald-400 bg-emerald-500/15 text-foreground' : 'border-border text-muted-foreground hover:border-emerald-400/60')}>
                  {label(c)}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No revenues are set up for this outlet yet (Settings &gt; Outlets &gt; Incomes &amp; Revenues). You can add one below.</p>
          )}
          {custom.map(c => (
            <div key={c.name} className="flex items-center justify-between text-[11px] bg-muted/50 rounded px-2 py-1">
              <span>{label(c)}</span>
              <button onClick={() => toggle(c)}><X className="w-3 h-3 text-muted-foreground" /></button>
            </div>
          ))}
          <div className="flex gap-1.5">
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Custom revenue" className="h-8 text-xs flex-1" />
            <Input value={value} onChange={e => setValue(e.target.value)} type="number" placeholder="0" className="h-8 text-xs w-16" />
            <Button type="button" variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={() => setType(type === 'percent' ? 'fixed' : 'percent')} title="Toggle % / KES">
              {type === 'percent' ? <Percent className="w-3 h-3" /> : 'KES'}
            </Button>
            <Button type="button" size="sm" className="h-8 px-2" onClick={addCustom}><Plus className="w-3 h-3" /></Button>
          </div>
          {selected.length > 0 && (
            <p className="text-[11px] text-muted-foreground">Selected: {selected.map(s => s.name).join(', ')}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Switch id="replace-rev" checked={replace} onCheckedChange={setReplace} />
          <Label htmlFor="replace-rev" className="text-xs">Replace the sales' existing revenues (otherwise add to them)</Label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={apply} disabled={saving || (!replace && selected.length === 0)}>{saving ? 'Applying...' : 'Apply'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
