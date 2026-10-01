import { useState } from 'react';
import { Input } from '@project/components/ui/input';
import { Button } from '@project/components/ui/button';
import { Plus, X, Percent } from 'lucide-react';
import { cn } from '@project/components/lib/utils';
import { Commission, commissionAmount } from '../hooks/useBranch';

export default function DeductionsPicker({ presets, selected, onChange, base }: {
  presets: Commission[];
  selected: Commission[];
  onChange: (c: Commission[]) => void;
  base: number;
}) {
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [type, setType] = useState<'percent' | 'fixed'>('percent');
  const isOn = (c: Commission) => selected.some(s => s.name === c.name);
  const toggle = (c: Commission) => onChange(isOn(c) ? selected.filter(s => s.name !== c.name) : [...selected, c]);
  const custom = selected.filter(s => !presets.some(p => p.name === s.name));

  const add = () => {
    const v = Number(value);
    if (!name.trim() || !(v > 0)) return;
    onChange([...selected.filter(s => s.name !== name.trim()), { name: name.trim(), type, value: v }]);
    setName(''); setValue('');
  };

  return (
    <div className="space-y-2">
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {presets.map(c => (
            <button key={c.name} type="button" onClick={() => toggle(c)}
              className={cn('text-[11px] px-2 py-1 rounded-full border transition-all',
                isOn(c) ? 'border-pink-400 bg-pink-500/15 text-foreground' : 'border-border text-muted-foreground hover:border-pink-400/60')}>
              {c.name} · {c.type === 'percent' ? `${c.value}%` : `KES ${c.value}`}
            </button>
          ))}
        </div>
      )}
      {custom.map(c => (
        <div key={c.name} className="flex items-center justify-between text-[11px] bg-muted/50 rounded px-2 py-1">
          <span>{c.name} · {c.type === 'percent' ? `${c.value}%` : `KES ${c.value}`}</span>
          <button onClick={() => toggle(c)}><X className="w-3 h-3 text-muted-foreground" /></button>
        </div>
      ))}
      <div className="flex gap-1.5">
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Custom deduction" className="h-8 text-xs flex-1" />
        <Input value={value} onChange={e => setValue(e.target.value)} type="number" placeholder="0" className="h-8 text-xs w-16" />
        <Button type="button" variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={() => setType(type === 'percent' ? 'fixed' : 'percent')} title="Toggle % / KES">
          {type === 'percent' ? <Percent className="w-3 h-3" /> : 'KES'}
        </Button>
        <Button type="button" size="sm" className="h-8 px-2" onClick={add}><Plus className="w-3 h-3" /></Button>
      </div>
      {selected.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Total deductions: KES {selected.reduce((s, c) => s + commissionAmount(c, base), 0).toLocaleString()}
        </p>
      )}
    </div>
  );
}
