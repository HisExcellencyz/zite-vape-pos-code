import { useState, useEffect, ReactNode } from 'react';
import { getDashboard, GetDashboardOutputType } from 'zitejs/api';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { Skeleton } from '@project/components/ui/skeleton';
import {
  DollarSign, ShoppingCart, TrendingDown, TrendingUp, Package, Users, MapPin, Store,
  LineChart as LineIcon, PieChart as PieIcon, BarChart3, Building2, Table2, Bike,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import DateRangeFilter from '../components/DateRangeFilter';
import { cn } from '@project/components/lib/utils';
import { useBranch } from '../hooks/useBranch';

const fmt = (n: number) => 'KES ' + n.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-2))', 'hsl(var(--chart-5))', '#64748b', '#f97316', '#06b6d4'];
const AXIS = { fontSize: 10, fill: 'hsl(var(--muted-foreground))' };
const GRID = 'hsl(var(--border))';
const TIP = { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--foreground))' };

// Fixed content heights so tiles that share a row are exactly the same size.
const ROW1_H = 280; // Top Selling Products / Top Customers
const ROW2_H = 220; // Delivery Distances / Rider Metrics

type View = 'chart' | 'table';
const KPI_BG: Record<string, string> = { sky: 'bg-sky-500/15', emerald: 'bg-emerald-500/15', red: 'bg-red-500/15', pink: 'bg-pink-500/15', amber: 'bg-amber-500/15' };
const KPI_BORDER: Record<string, string> = { sky: 'border-l-sky-500', emerald: 'border-l-emerald-500', red: 'border-l-red-500', pink: 'border-l-pink-500', amber: 'border-l-amber-500' };

function Tile({ title, icon: Icon, children, className, contentClassName, view, onView }: {
  title: string; icon: React.ElementType; children: ReactNode; className?: string; contentClassName?: string;
  view: View; onView: (v: View) => void;
}) {
  return (
    <Card className={cn('bg-card border-border flex flex-col h-full', className)}>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2"><Icon className="w-4 h-4 text-primary" /> {title}</CardTitle>
        <div className="flex rounded-md border border-border p-0.5">
          {(['chart', 'table'] as View[]).map(v => (
            <button key={v} onClick={() => onView(v)} title={v === 'chart' ? 'Graph view' : 'Table view'}
              className={cn('p-1 rounded', view === v ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground')}>
              {v === 'chart' ? <BarChart3 className="w-3.5 h-3.5" /> : <Table2 className="w-3.5 h-3.5" />}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className={cn('flex-1 min-h-0', contentClassName)}>{children}</CardContent>
    </Card>
  );
}

function MiniTable({ head, rows, maxH = 300 }: { head: string[]; rows: (string | number)[][]; maxH?: number }) {
  const [q, setQ] = useState('');
  const [field, setField] = useState(-1);
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const num = (v: string | number) => typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.-]/g, ''));
  const shown = rows
    .filter(r => !q || (field < 0 ? r : [r[field]]).some(c => String(c).toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => {
      if (!sort) return 0;
      const x = a[sort.col], y = b[sort.col];
      const nx = num(x), ny = num(y);
      const cmp = !isNaN(nx) && !isNaN(ny) && String(x).match(/\d/) ? nx - ny : String(x).localeCompare(String(y));
      return cmp * sort.dir;
    });
  const click = (i: number) => setSort(s => s?.col === i ? (s.dir === 1 ? { col: i, dir: -1 } : null) : { col: i, dir: 1 });
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter..." className="flex-1 h-7 rounded-md border border-border bg-background px-2 text-xs" />
        <select value={field} onChange={e => setField(Number(e.target.value))} className="h-7 rounded-md border border-border bg-background px-1 text-xs">
          <option value={-1}>All fields</option>
          {head.map((h, i) => <option key={h} value={i}>{h}</option>)}
        </select>
      </div>
      <div className="overflow-auto" style={{ maxHeight: maxH }}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card">
            <tr className="border-b border-border text-muted-foreground">
              {head.map((h, i) => (
                <th key={h} onClick={() => click(i)} className={cn('p-2 font-medium cursor-pointer select-none hover:text-foreground whitespace-nowrap', i === 0 ? 'text-left' : 'text-right')}>
                  {h}{sort?.col === i ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                {r.map((c, j) => <td key={j} className={cn('p-2', j === 0 ? 'text-left text-foreground' : 'text-right text-muted-foreground')}>{c}</td>)}
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={head.length} className="p-3 text-center text-muted-foreground">No matches</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const Empty = ({ text }: { text: string }) => <p className="text-sm text-muted-foreground text-center py-10">{text}</p>;

function useViews() {
  const [views, setViews] = useState<Record<string, View>>(() => {
    try { return JSON.parse(localStorage.getItem('dashViews') || '{}'); } catch { return {}; }
  });
  const get = (k: string, d: View = 'chart') => views[k] || d;
  const set = (k: string) => (v: View) => {
    const next = { ...views, [k]: v };
    setViews(next);
    try { localStorage.setItem('dashViews', JSON.stringify(next)); } catch {}
  };
  return { get, set };
}

export default function DashboardPage({ scope = 'outlet' }: { scope?: 'outlet' | 'business' }) {
  const [data, setData] = useState<GetDashboardOutputType | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const { currentBranch } = useBranch();
  const views = useViews();
  const branchId = scope === 'business' ? undefined : currentBranch?.id;

  const load = async () => {
    setLoading(true);
    try {
      // Inclusive whole-day range in East African Time (UTC+3)
      const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      setData(await getDashboard({
        startDate: startDate ? new Date(`${day(startDate)}T00:00:00.000+03:00`).toISOString() : undefined,
        endDate: endDate ? new Date(`${day(endDate)}T23:59:59.999+03:00`).toISOString() : undefined,
        branchId,
      }));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Reloads automatically whenever the outlet or the chosen dates change.
  useEffect(() => { if (scope === 'business' || currentBranch) load(); }, [branchId, scope, startDate?.getTime(), endDate?.getTime()]);

  const kpis = data ? [
    { label: 'Total Sales', value: fmt(data.totalRevenue), icon: ShoppingCart, color: 'text-sky-500', tint: 'sky', change: `${data.totalSales} orders, before discounts` },
    { label: 'Profit / Loss', value: fmt(data.profitLoss), icon: data.profitLoss >= 0 ? TrendingUp : TrendingDown, color: data.profitLoss >= 0 ? 'text-emerald-500' : 'text-red-500', tint: data.profitLoss >= 0 ? 'emerald' : 'red', change: data.profitLoss >= 0 ? 'Profit' : 'Loss' },
    { label: 'Total Expenses', value: fmt(data.totalExpenses), icon: DollarSign, color: 'text-pink-500', tint: 'pink', change: `Incl. ${fmt(data.totalPurchases)} purchases, ${fmt(data.totalDiscounts || 0)} discounts` },
    { label: 'Stock Value', value: fmt(data.stockValue), icon: Package, color: 'text-amber-500', tint: 'amber', change: 'At cost price' },
  ] : [];

  const d = data?.deliveryStats;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{scope === 'business' ? 'Business Overview' : 'Dashboard'}</h1>
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            {scope === 'business'
              ? <><Building2 className="w-3.5 h-3.5" /> All outlets combined — business and customer totals</>
              : <><Store className="w-3.5 h-3.5" /> {currentBranch?.branchName || 'Outlet'} — this outlet only</>}
          </p>
        </div>
        <DateRangeFilter
          value={{ start: startDate, end: endDate }}
          onChange={r => { setStartDate(r.start); setEndDate(r.end); }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading || !data
          ? [...Array(4)].map((_, i) => <Card key={i} className="bg-card"><CardContent className="pt-6"><Skeleton className="h-16 w-full" /></CardContent></Card>)
          : kpis.map(kpi => (
            <Card key={kpi.label} className={`bg-card border-border border-l-4 ${KPI_BORDER[kpi.tint]}`}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">{kpi.label}</p>
                    <p className={`text-2xl font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{kpi.change}</p>
                  </div>
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${kpi.color} ${KPI_BG[kpi.tint]}`}><kpi.icon className="w-5 h-5" /></div>
                </div>
              </CardContent>
            </Card>
          ))}
      </div>

      {data && d && (
        // One grid with six direct children (two per row). Grid rows stretch, so the two tiles in each row
        // are always exactly the same height: Top Products = Top Customers, Delivery Distances = Rider Metrics.
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          <Tile title="Revenue Trend" icon={LineIcon} view={views.get('rev')} onView={views.set('rev')}>
            {data.revenueByDay.length === 0 ? <Empty text="No sales data yet" /> : views.get('rev') === 'chart' ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={data.revenueByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis dataKey="date" tick={AXIS} tickFormatter={x => x.slice(5)} />
                  <YAxis tick={AXIS} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={TIP} formatter={(v: number) => [fmt(v), 'Revenue']} />
                  <Line type="monotone" dataKey="revenue" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : <MiniTable head={['Date', 'Revenue']} rows={data.revenueByDay.map(r => [r.date, fmt(r.revenue)])} />}
          </Tile>

          <Tile title="Expenses by Category" icon={PieIcon} view={views.get('exp')} onView={views.set('exp')}>
            {data.expensesByCategory.length === 0 ? <Empty text="No expense data yet" /> : views.get('exp') === 'chart' ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={data.expensesByCategory} dataKey="amount" nameKey="category" cx="50%" cy="50%" outerRadius={80} label={({ category, percent }) => `${category} ${(percent * 100).toFixed(0)}%`}>
                    {data.expensesByCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={TIP} formatter={(v: number) => [fmt(v), 'Amount']} />
                </PieChart>
              </ResponsiveContainer>
            ) : <MiniTable head={['Category', 'Amount']} rows={data.expensesByCategory.map(r => [r.category, fmt(r.amount)])} />}
          </Tile>

          {/* Row 1 */}
          <Tile title="Top Selling Products" icon={Package} view={views.get('prod')} onView={views.set('prod')}>
            {data.topProducts.length === 0 ? <Empty text="No sales data yet" /> : views.get('prod') === 'chart' ? (
              <ResponsiveContainer width="100%" height={ROW1_H}>
                <BarChart data={data.topProducts} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis type="number" tick={AXIS} />
                  <YAxis type="category" dataKey="productName" width={100} tick={AXIS} />
                  <Tooltip contentStyle={TIP} />
                  <Bar dataKey="totalSold" name="Units sold" fill="hsl(var(--chart-3))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <MiniTable maxH={ROW1_H - 40} head={['Product', 'Sold', 'Revenue']} rows={data.topProducts.map(p => [p.productName, p.totalSold, fmt(p.revenue)])} />}
          </Tile>

          <Tile title={scope === 'business' ? 'Top Customers (all outlets)' : 'Top Customers (this outlet)'} icon={Users} view={views.get('cust', 'table')} onView={views.set('cust')}>
            {data.topCustomers.length === 0 ? <Empty text="No customer data yet" /> : views.get('cust', 'table') === 'chart' ? (
              <ResponsiveContainer width="100%" height={ROW1_H}>
                <BarChart data={data.topCustomers.slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis type="number" tick={AXIS} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="customerName" width={100} tick={AXIS} />
                  <Tooltip contentStyle={TIP} formatter={(v: number) => [fmt(v), 'Spent']} />
                  <Bar dataKey="totalSpent" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <MiniTable maxH={ROW1_H - 40} head={['Customer', 'Phone', 'Orders', 'Spent']} rows={data.topCustomers.map(c => [c.customerName, c.phone, c.orderCount, fmt(c.totalSpent)])} />}
          </Tile>

          {/* Row 2 */}
          <Tile title="Delivery Distances" icon={MapPin} view={views.get('del', 'table')} onView={views.set('del')}>
            {d.totalDeliveries === 0 ? <Empty text="No delivery data yet. Add distances in POS." /> : views.get('del', 'table') === 'chart' ? (
              <ResponsiveContainer width="100%" height={ROW2_H}>
                <BarChart data={[{ n: 'Shortest', km: d.shortestKm }, { n: 'Average', km: d.avgDistanceKm }, { n: 'Longest', km: d.longestKm }]}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis dataKey="n" tick={AXIS} />
                  <YAxis tick={AXIS} />
                  <Tooltip contentStyle={TIP} formatter={(v: number) => [`${v} km`, 'Distance']} />
                  <Bar dataKey="km" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <MiniTable maxH={ROW2_H - 40} head={['Metric', 'Value']} rows={[['Total deliveries', d.totalDeliveries], ['Average distance (km)', d.avgDistanceKm], ['Longest (km)', d.longestKm], ['Shortest (km)', d.shortestKm]]} />}
          </Tile>

          <Tile title="Rider Metrics" icon={Bike} view={views.get('rider', 'table')} onView={views.set('rider')}>
            {data.riderStats.length === 0 ? <Empty text="No rider data yet. Choose a rider at POS when checking out." /> : views.get('rider', 'table') === 'chart' ? (
              <ResponsiveContainer width="100%" height={ROW2_H}>
                <BarChart data={data.riderStats.slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis type="number" tick={AXIS} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={100} tick={AXIS} />
                  <Tooltip contentStyle={TIP} />
                  <Bar dataKey="orders" name="Orders" fill="hsl(var(--chart-3))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <MiniTable
                maxH={ROW2_H - 40}
                head={['Rider', 'Type', 'Orders', 'Amount', 'Distance (km)', 'Rider Charge']}
                rows={data.riderStats.map(r => [r.name, r.type, r.orders, fmt(r.amount), r.km, fmt(r.riderCharge)])}
              />
            )}
          </Tile>
        </div>
      )}
    </div>
  );
}
