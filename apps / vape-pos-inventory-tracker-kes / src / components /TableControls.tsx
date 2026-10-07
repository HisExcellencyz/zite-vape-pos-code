import { useMemo, useState } from 'react';
import { ArrowDownAZ, ArrowUpAZ } from 'lucide-react';

export type FieldDef<T> = { key: string; label: string; get?: (row: T) => unknown };

const val = <T,>(f: FieldDef<T>, r: T) => (f.get ? f.get(r) : (r as any)[f.key]);
const txt = (v: unknown) => (v == null ? '' : Array.isArray(v) ? v.join(', ') : String(v));

/** Search (any or one field) + sort (any field) for list views. */
export function useTableControls<T>(rows: T[], fields: FieldDef<T>[]) {
  const [q, setQ] = useState('');
  const [field, setField] = useState('all');
  const [sortKey, setSortKey] = useState('');
  const [dir, setDir] = useState<1 | -1>(1);

  const view = useMemo(() => {
    const ql = q.toLowerCase();
    const fs = field === 'all' ? fields : fields.filter(f => f.key === field);
    let out = q ? rows.filter(r => fs.some(f => txt(val(f, r)).toLowerCase().includes(ql))) : rows.slice();
    const sf = fields.find(f => f.key === sortKey);
    if (sf) {
      out = out.sort((a, b) => {
        const x = val(sf, a), y = val(sf, b);
        const nx = Number(x), ny = Number(y);
        const c = typeof x === 'number' || (!isNaN(nx) && !isNaN(ny) && x !== '' && y !== '') ? nx - ny : txt(x).localeCompare(txt(y));
        return c * dir;
      });
    }
    return out;
  }, [rows, fields, q, field, sortKey, dir]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setDir(d => (d === 1 ? -1 : 1));
    else { setSortKey(key); setDir(1); }
  };

  return { view, q, setQ, field, setField, sortKey, setSortKey, dir, setDir, toggleSort, fields };
}

const sel = 'h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground';

export function TableControls<T>({ c }: { c: ReturnType<typeof useTableControls<T>> }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search box is twice as long as the old Filter box (w-40 -> w-80) */}
      <input value={c.q} onChange={e => c.setQ(e.target.value)} placeholder="Search..." className={`${sel} w-80 max-w-full`} />
      <select value={c.field} onChange={e => c.setField(e.target.value)} className={sel} title="Search field">
        <option value="all">All fields</option>
        {c.fields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
      </select>
      <select value={c.sortKey} onChange={e => c.setSortKey(e.target.value)} className={sel} title="Sort by">
        <option value="">Sort: default</option>
        {c.fields.map(f => <option key={f.key} value={f.key}>Sort: {f.label}</option>)}
      </select>
      <button type="button" onClick={() => c.setDir(d => (d === 1 ? -1 : 1))} className={`${sel} px-2`} title="Sort direction">
        {c.dir === 1 ? <ArrowUpAZ className="w-4 h-4" /> : <ArrowDownAZ className="w-4 h-4" />}
      </button>
    </div>
  );
}

/** Clickable sortable header label. */
export function SortTh<T>({ c, k, children, className = '' }: { c: ReturnType<typeof useTableControls<T>>; k: string; children: React.ReactNode; className?: string }) {
  return (
    <th onClick={() => c.toggleSort(k)} className={`p-3 font-medium cursor-pointer select-none hover:text-foreground ${className}`}>
      {children}{c.sortKey === k ? (c.dir === 1 ? ' ▲' : ' ▼') : ''}
    </th>
  );
}
