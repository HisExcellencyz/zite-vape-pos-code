import { useEffect, useState, type MouseEvent } from 'react';
import { format } from 'date-fns';
import { Loader2, History } from 'lucide-react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { getHistory, GetHistoryOutputType } from 'zitejs/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@project/components/ui/tabs';
import SummaryTiles from './SummaryTiles';

export type HistoryKind = 'customer' | 'supplier' | 'product';
export interface HistoryTarget { kind: HistoryKind; id: string; title: string; subtitle?: string }

const kes = (n: unknown) => `KES ${Math.round(Number(n) || 0).toLocaleString()}`;
const when = (v: unknown) => { const d = v ? new Date(String(v)) : null; return d && !isNaN(d.getTime()) ? format(d, 'dd MMM yyyy') : '-'; };
const monthName = (m: string) => format(new Date(`${m}-01T00:00:00`), 'MMM');

/**
 * Click handler for a list row or card that opens the history, unless the tap
 * landed on something interactive inside it (checkbox, button, link, input).
 */
export const rowTap = (open: () => void) => (e: MouseEvent) => {
  if ((e.target as HTMLElement).closest('button, a, input, select, textarea, label, [role="checkbox"], [role="menuitem"]')) return;
  open();
};

/** Transaction history for one customer, supplier or product, with key figures and a 6-month trend. */
export default function HistoryDialog({ target, onClose }: { target: HistoryTarget | null; onClose: () => void }) {
  const [data, setData] = useState<GetHistoryOutputType | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!target) return;
    let live = true;
    setData(null); setError('');
    getHistory({ kind: target.kind, id: target.id })
      .then(r => { if (live) setData(r); })
      .catch(e => { if (live) setError(e.message || 'Could not load the history'); });
    return () => { live = false; };
  }, [target?.kind, target?.id]);

  const sections = data?.sections ?? [];

  return (
    <Dialog open={!!target} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><History className="w-4 h-4 text-primary shrink-0" /> {target?.title}</DialogTitle>
          {target?.subtitle && <p className="text-xs text-muted-foreground">{target.subtitle}</p>}
        </DialogHeader>

        {error ? <p className="text-sm text-destructive py-6 text-center">{error}</p>
          : !data ? <div className="py-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          : (
            <div className="space-y-4">
              <SummaryTiles items={data.stats} />

              <div className="tile rounded-xl border bg-card p-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">{data.monthsLabel} · last 6 months</p>
                <div className="h-28">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.months.map(m => ({ ...m, name: monthName(m.month) }))} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                      <defs>
                        <linearGradient id="histBar" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.95} />
                          <stop offset="100%" stopColor="hsl(var(--secondary))" stopOpacity={0.55} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip
                        cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 10, fontSize: 12 }}
                        formatter={(v: number, _n: string, p: any) => [p?.payload?.units != null ? `${kes(v)} · ${p.payload.units} units` : kes(v), '']}
                        separator=""
                      />
                      <Bar dataKey="value" fill="url(#histBar)" radius={[6, 6, 0, 0]} maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <Tabs defaultValue={sections[0]?.title}>
                <TabsList className="bg-muted flex-wrap h-auto">
                  {sections.map(s => <TabsTrigger key={s.title} value={s.title}>{s.title} ({s.rows.length})</TabsTrigger>)}
                </TabsList>
                {sections.map(s => (
                  <TabsContent key={s.title} value={s.title} className="mt-3">
                    {s.rows.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">Nothing recorded yet.</p> : (
                      <div className="overflow-auto max-h-[45vh] rounded-xl border">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-card"><tr className="border-b">
                            {s.columns.map(c => <th key={c.key} className={`p-2 ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{c.label}</th>)}
                          </tr></thead>
                          <tbody>
                            {s.rows.map((r, i) => (
                              <tr key={i} className={`border-b last:border-0 ${r.status === 'Voided' ? 'opacity-50 line-through' : ''}`}>
                                {s.columns.map(c => (
                                  <td key={c.key} className={`p-2 ${c.align === 'right' ? 'text-right whitespace-nowrap' : ''} ${c.key === 'saleNumber' || c.key === 'purchaseNumber' ? 'font-mono text-muted-foreground' : ''}`}>
                                    {c.money ? kes(r[c.key]) : c.date ? when(r[c.key]) : c.key === 'saleNumber' || c.key === 'purchaseNumber' ? `#${r[c.key] ?? ''}` : String(r[c.key] ?? '-')}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          )}
      </DialogContent>
    </Dialog>
  );
}
