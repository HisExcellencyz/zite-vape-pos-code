import { Input } from '@project/components/ui/input';
import { Button } from '@project/components/ui/button';
import { Label } from '@project/components/ui/label';
import { Switch } from '@project/components/ui/switch';
import { Plus, Trash2 } from 'lucide-react';
import { Commission, autoOn } from '../hooks/useBranch';

interface Props {
  value: Commission[];
  onChange: (c: Commission[]) => void;
  title?: string;
  /** Optional helper text. Nothing is shown when it is empty. */
  description?: string;
  namePlaceholder?: string;
}

/**
 * One row per item: on/off toggle, name, amount, KES / % switch and delete.
 * Used for both "Incomes & Revenues" and "Commissions & Deductions" in Settings > Outlets.
 * Items switched on are applied automatically to every POS order (and can be switched off per order).
 */
export default function CommissionEditor({
  value,
  onChange,
  title = 'Commissions & Deductions',
  description = '',
  namePlaceholder = 'e.g. Glovo',
}: Props) {
  const update = (i: number, patch: Partial<Commission>) => onChange(value.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{title}</Label>
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => onChange([...value, { name: '', type: 'percent', value: 0, enabled: true }])}>
          <Plus className="w-3 h-3 mr-1" /> Add
        </Button>
      </div>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      {value.map((c, i) => (
        <div key={i} className="flex gap-2 items-center">
          <Switch
            checked={autoOn(c)}
            onCheckedChange={v => update(i, { enabled: v })}
            title="On = applied automatically to every POS order"
            className="shrink-0"
          />
          <Input value={c.name} onChange={e => update(i, { name: e.target.value })} placeholder={namePlaceholder} className="flex-1 min-w-0 h-9" />
          <Input type="number" value={c.value || ''} onChange={e => update(i, { value: Number(e.target.value) })} className="w-20 h-9" />
          <Button type="button" variant="outline" size="sm" className="h-9 w-14" onClick={() => update(i, { type: c.type === 'percent' ? 'fixed' : 'percent' })} title="Switch between % and KES">
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
