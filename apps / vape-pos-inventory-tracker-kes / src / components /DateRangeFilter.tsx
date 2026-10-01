import { DatePicker } from '@project/components/ui/date-picker';
import { Button } from '@project/components/ui/button';
import { X } from 'lucide-react';

export type Range = { start?: Date; end?: Date };

const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Inclusive start/end bounds (ms) in East African Time. */
export const eatBounds = (r: Range) => ({
  from: r.start ? new Date(`${day(r.start)}T00:00:00.000+03:00`).getTime() : -Infinity,
  to: r.end ? new Date(`${day(r.end)}T23:59:59.999+03:00`).getTime() : Infinity,
});
export const inRange = (r: Range, iso?: string) => {
  if (!r.start && !r.end) return true;
  if (!iso) return false;
  const t = new Date(iso).getTime();
  const b = eatBounds(r);
  return t >= b.from && t <= b.to;
};

export default function DateRangeFilter({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div className="flex items-center gap-1.5 flex-nowrap">
      <div className="w-[9.5rem]"><DatePicker value={value.start} onChange={d => onChange({ ...value, start: d })} /></div>
      <span className="text-xs text-muted-foreground">to</span>
      <div className="w-[9.5rem]"><DatePicker value={value.end} onChange={d => onChange({ ...value, end: d })} /></div>
      {(value.start || value.end) && (
        <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => onChange({})} title="Clear dates"><X className="w-3.5 h-3.5" /></Button>
      )}
    </div>
  );
}
