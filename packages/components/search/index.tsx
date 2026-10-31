import { forwardRef, useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '../lib/utils';

export { normText, phoneDigits, matchesQuery } from './match';

// ---------- Search box ----------

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
  /** Wait this many ms after the last key before calling onChange (for searches that ask the server). */
  debounceMs?: number;
  inputClassName?: string;
};

/**
 * Search box with a search icon, a clear (×) button and Esc to clear.
 * With debounceMs it shows typing at once but reports the text only after a short pause.
 */
export const SearchInput = forwardRef<HTMLInputElement, Props>(function SearchInput(
  { value, onChange, debounceMs, className, inputClassName, placeholder = 'Search…', ...rest },
  ref,
) {
  const [text, setText] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => { setText(value); }, [value]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const send = (v: string, now = false) => {
    setText(v);
    clearTimeout(timer.current);
    if (!debounceMs || now) onChange(v);
    else timer.current = setTimeout(() => onChange(v), debounceMs);
  };

  return (
    <div className={cn('relative w-full', className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={ref}
        type="search"
        value={text}
        placeholder={placeholder}
        onChange={e => send(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape' && text) { e.preventDefault(); e.stopPropagation(); send('', true); } }}
        className={cn(
          'flex h-9 w-full rounded-lg border border-input bg-background/60 pl-8 pr-8 py-1 text-sm shadow-sm transition-all',
          'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/25',
          '[&::-webkit-search-cancel-button]:hidden',
          inputClassName,
        )}
        {...rest}
      />
      {text && (
        <button
          type="button"
          aria-label="Clear search"
          title="Clear (Esc)"
          onClick={() => send('', true)}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
});
