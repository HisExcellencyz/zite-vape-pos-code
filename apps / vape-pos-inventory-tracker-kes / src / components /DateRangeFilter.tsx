import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { addDays, format, startOfDay } from 'date-fns';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import { Calendar } from '@project/components/ui/calendar';
import { Button } from '@project/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@project/components/ui/dialog';
import { cn } from '@project/components/lib/utils';

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

const short = (d: Date) => format(d, 'd MMM');

export default function DateRangeFilter({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>();

  const active = !!(value.start || value.end);
  const label = !active
    ? 'All dates'
    : value.start && value.end
      ? day(value.start) === day(value.end) ? short(value.start) : `${short(value.start)} – ${short(value.end)}`
      : value.start ? `From ${short(value.start)}` : `Until ${short(value.end!)}`;

  const openDialog = () => {
    setCustom(false);
    setDraft(active ? { from: value.start, to: value.end } : undefined);
    setOpen(true);
  };

  const apply = (start?: Date, end?: Date) => {
    onChange({ start, end });
    setOpen(false);
  };

  const today = startOfDay(new Date());
  const presets: { label: string; start: Date; end: Date }[] = [
    { label: 'Today', start: today, end: today },
    { label: 'Yesterday', start: addDays(today, -1), end: addDays(today, -1) },
    { label: '7 days', start: addDays(today, -6), end: today },
    { label: '30 days', start: addDays(today, -29), end: today },
  ];
  const isActive = (p: { start: Date; end: Date }) =>
    !custom && !!value.start && !!value.end && day(value.start) === day(p.start) && day(value.end) === day(p.end);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={openDialog}
        aria-label="Filter by date"
        title="Filter by date"
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-blue-500/50 text-blue-500 transition-colors hover:bg-blue-500/20',
          active ? 'bg-blue-500/25' : 'bg-blue-500/10',
        )}
      >
        <CalendarIcon className="size-4" />
      </button>
      <span className={cn('text-xs whitespace-nowrap', active ? 'text-foreground font-medium' : 'text-muted-foreground')}>{label}</span>
      {active && (
        <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => onChange({})} title="Clear dates">
          <X className="w-3.5 h-3.5" />
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="size-5 text-blue-500" /> Filter by date
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-2">
            {presets.map(p => (
              <Button
                key={p.label}
                type="button"
                variant="outline"
                className={cn('border-blue-500/40 hover:bg-blue-500/10', isActive(p) && 'bg-blue-500 text-white hover:bg-blue-600')}
                onClick={() => apply(p.start, p.end)}
              >
                {p.label}
              </Button>
            ))}
            <Button
              type="button"
              variant="outline"
              className={cn('col-span-2 border-blue-500/40 hover:bg-blue-500/10', custom && 'bg-blue-500 text-white hover:bg-blue-600')}
              onClick={() => setCustom(true)}
            >
              Custom
            </Button>
          </div>

          {custom && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground text-center">
                {draft?.from
                  ? `${short(draft.from)} – ${draft.to ? short(draft.to) : 'pick an end date'}`
                  : 'Pick a start date, then an end date'}
              </p>
              <div className="flex justify-center rounded-lg border border-border">
                <Calendar mode="range" selected={draft} onSelect={setDraft} defaultMonth={draft?.from} />
              </div>
            </div>
          )}

          <DialogFooter>
            {active && (
              <Button type="button" variant="ghost" onClick={() => apply(undefined, undefined)}>Clear</Button>
            )}
            {custom && (
              <Button type="button" disabled={!draft?.from} onClick={() => apply(draft!.from, draft!.to ?? draft!.from)}>
                Apply
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
