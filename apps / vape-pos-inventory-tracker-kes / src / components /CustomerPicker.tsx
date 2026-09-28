import { useState, useEffect, useRef } from 'react';
import { getCustomers } from 'zitejs/api';
import { Input } from '@project/components/ui/input';
import { Search, X } from 'lucide-react';

export interface PickableCustomer {
  id: string;
  customerName?: string;
  phoneNumber?: string;
}

interface Props {
  onSelect: (customer: PickableCustomer) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

/**
 * A search-as-you-type customer lookup with a search icon, used anywhere a
 * customer needs to be linked/found quickly (e.g. POS "Link customer").
 * Searches by name or phone number and lets the user click a result to pick it.
 */
export default function CustomerPicker({ onSelect, placeholder = 'Search customer by name or phone...', className = '', autoFocus }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PickableCustomer[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await getCustomers({ search: query, limit: 20 });
        setResults(res.customers as PickableCustomer[]);
      } catch {
        setResults([]);
      }
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          autoFocus={autoFocus}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="pl-8 pr-8 h-9 text-xs"
        />
        {query && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2"
            onClick={() => { setQuery(''); setResults([]); }}
          >
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        )}
      </div>
      {open && query && (
        <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-md border border-border bg-popover shadow-md">
          {loading ? (
            <div className="p-3 text-xs text-muted-foreground">Searching...</div>
          ) : results.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">No matches found</div>
          ) : results.map(c => (
            <button
              key={c.id}
              type="button"
              className="w-full text-left px-3 py-2 text-xs hover:bg-muted flex flex-col gap-0.5"
              onClick={() => { onSelect(c); setQuery(''); setResults([]); setOpen(false); }}
            >
              <span className="font-medium text-foreground">{c.customerName}</span>
              <span className="text-muted-foreground">{c.phoneNumber}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
