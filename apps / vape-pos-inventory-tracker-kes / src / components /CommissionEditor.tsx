import { Input } from '@project/components/ui/input';
import { Button } from '@project/components/ui/button';
import { Label } from '@project/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';
import { Commission } from '../hooks/useBranch';

export default function CommissionEditor({ value, onChange }: { value: Commission[]; onChange: (c: Commission[]) => void }) {
  const update = (i: number, patch: Partial<Commission>) => onChange(value.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Commissions & deductions</Label>
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => onChange([...value, { name: '', type: 'percent', value: 0 }])}>
          <Plus className="w-3 h-3 mr-1" /> Add
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">These appear as one-tap options at POS and in Sales bulk actions for this outlet.</p>
      {value.map((c, i) => (
        <div key={i} className="flex gap-2">
          <Input value={c.name} onChange={e => update(i, { name: e.target.value })} placeholder="e.g. Rider commission" className="flex-1 h-9" />
          <Input type="number" value={c.value || ''} onChange={e => update(i, { value: Number(e.target.value) })} className="w-20 h-9" />
          <Button type="button" variant="outline" size="sm" className="h-9 w-14" onClick={() => update(i, { type: c.type === 'percent' ? 'fixed' : 'percent' })}>
            {c.type === 'percent' ? '%' : 'KES'}
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <Trash2 className="w-3.5 h-3.5 text-destructive" />
          </Button>
        </div>
      ))}
    </div>
  );
}
