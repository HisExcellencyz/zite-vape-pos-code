import * as React from 'react';
import { addDays, format, startOfDay } from 'date-fns';
import { Calendar as CalendarIcon, X } from 'lucide-react';

import { cn } from '../lib/utils';
import { Button } from './button';
import { Calendar } from './calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './dialog';
import { Input } from './input';

const DISPLAY_FORMAT = 'MMM d, yyyy';

interface DatePickerProps {
  value?: Date;
  onChange?: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * A blue calendar icon that opens a dialog. The dialog offers quick choices
 * (Today, Yesterday, 7 days ago, 30 days ago) and a Custom option that shows
 * a calendar to pick any date.
 */
function DatePicker({
  value,
  onChange,
  placeholder = 'Pick a date',
  disabled,
  className,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [custom, setCustom] = React.useState(false);

  const openDialog = () => {
    setCustom(false);
    setOpen(true);
  };

  const choose = (date: Date | undefined) => {
    onChange?.(date);
    setOpen(false);
  };

  const today = startOfDay(new Date());
  const presets: { label: string; date: Date }[] = [
    { label: 'Today', date: today },
    { label: 'Yesterday', date: addDays(today, -1) },
    { label: '7 days ago', date: addDays(today, -7) },
    { label: '30 days ago', date: addDays(today, -30) },
  ];
  const isSelected = (d: Date) =>
    !!value && format(value, 'yyyy-MM-dd') === format(d, 'yyyy-MM-dd');

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <button
        type="button"
        aria-label={placeholder}
        title={placeholder}
        disabled={disabled}
        onClick={openDialog}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-blue-500/50 bg-blue-500/10 text-blue-500 transition-colors hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <CalendarIcon className="size-4" />
      </button>
      <span
        className={cn(
          'min-w-0 truncate text-sm',
          value ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {value ? format(value, DISPLAY_FORMAT) : placeholder}
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="size-5 text-blue-500" /> Select date
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {presets.map(p => (
              <Button
                key={p.label}
                type="button"
                variant="outline"
                className={cn(
                  'border-blue-500/40 hover:bg-blue-500/10',
                  !custom && isSelected(p.date) && 'bg-blue-500 text-white hover:bg-blue-600',
                )}
                onClick={() => choose(p.date)}
              >
                {p.label}
              </Button>
            ))}
            <Button
              type="button"
              variant="outline"
              className={cn(
                'col-span-2 border-blue-500/40 hover:bg-blue-500/10',
                custom && 'bg-blue-500 text-white hover:bg-blue-600',
              )}
              onClick={() => setCustom(true)}
            >
              Custom
            </Button>
          </div>
          {custom && (
            <div className="flex justify-center rounded-lg border border-border">
              <Calendar
                mode="single"
                selected={value}
                defaultMonth={value}
                onSelect={date => date && choose(date)}
              />
            </div>
          )}
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => choose(undefined)}
            >
              <X className="mr-1 size-3.5" /> Clear date
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DateTimePicker({
  value,
  onChange,
  placeholder = 'Pick a date',
  disabled,
  className,
}: DatePickerProps) {
  const handleDateChange = (date: Date | undefined) => {
    if (!date) {
      onChange?.(undefined);
      return;
    }
    const next = new Date(date);
    // Keep the already-chosen time when only the day changes
    if (value) {
      next.setHours(value.getHours(), value.getMinutes(), 0, 0);
    }
    onChange?.(next);
  };

  const handleTimeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const [hours, minutes] = event.target.value.split(':').map(Number);
    if (Number.isNaN(hours)) return;
    const next = value ? new Date(value) : new Date();
    next.setHours(hours, Number.isNaN(minutes) ? 0 : minutes, 0, 0);
    onChange?.(next);
  };

  return (
    <div className={cn('flex gap-2', className)}>
      <DatePicker
        value={value}
        onChange={handleDateChange}
        placeholder={placeholder}
        disabled={disabled}
        className="min-w-0 flex-1"
      />
      <Input
        type="time"
        aria-label="Time"
        value={value ? format(value, 'HH:mm') : ''}
        onChange={handleTimeChange}
        disabled={disabled}
        className="w-auto shrink-0"
      />
    </div>
  );
}

export { DatePicker, DateTimePicker };
export type { DatePickerProps };
