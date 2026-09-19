import { useState, useEffect } from 'react';
import { getDashboard, GetDashboardOutputType } from 'zitejs/api';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { Skeleton } from '@project/components/ui/skeleton';
import { DollarSign, ShoppingCart, TrendingDown, TrendingUp, Package, Users, MapPin } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { DatePicker } from '@project/components/ui/date-picker';
import { Button } from '@project/components/ui/button';

const fmt = (n: number) => 'KES ' + n.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const COLORS = ['hsl(217,91%,60%)', 'hsl(330,81%,60%)', 'hsl(160,84%,39%)', 'hsl(38,92%,50%)', 'hsl(270,76%,60%)', '#64748b', '#f97316', '#06b6d4'];

export default function DashboardPage() {
  const [data, setData] = useState<GetDashboardOutputType | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();

  const load = async () => {
    setLoading(true);
    try {
      const res = await getDashboard({
        startDate: startDate?.toISOString(),
        endDate: endDate?.toISOString(),
      });
      setData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const kpis = data ? [
    { label: 'Total Sales', value: fmt(data.totalRevenue), icon: ShoppingCart, color: 'text-primary', change: `${data.totalSales} orders` },
    { label: 'Profit / Loss', value: fmt(data.profitLoss), icon: data.profitLoss >= 0 ? TrendingUp : TrendingDown, color: data.profitLoss >= 0 ? 'text-emerald-400' : 'text-red-400', change: data.profitLoss >= 0 ? 'Profit' : 'Loss' },
    { label: 'Total Expenses', value: fmt(data.totalExpenses), icon: DollarSign, color: 'text-secondary', change: `Incl. ${fmt(data.totalPurchases)} purchases` },
    { label: 'Stock Value', value: fmt(data.stockValue), icon: Package, color: 'text-amber-400', change: 'At cost price' },
  ] : [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Business overview and performance</p>
        </div>
        <div className="flex items-center gap-2">
          <DatePicker value={startDate} onChange={setStartDate} />
          <span className="text-muted-foreground text-sm">to</span>
          <DatePicker value={endDate} onChange={setEndDate} />
          <Button onClick={load} size="sm">Apply</Button>
        </div>
      </div>

      {/* KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="bg-card"><CardContent className="pt-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map(kpi => (
            <Card key={kpi.label} className="bg-card border-border">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">{kpi.label}</p>
                    <p className="text-2xl font-bold text-foreground mt-1">{kpi.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{kpi.change}</p>
                  </div>
                  <div className={`w-10 h-10 rounded-lg bg-muted flex items-center justify-center ${kpi.color}`}>
                    <kpi.icon className="w-5 h-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Charts Row */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Revenue Trend */}
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-sm font-medium">Revenue Trend</CardTitle></CardHeader>
            <CardContent>
              {data.revenueByDay.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={data.revenueByDay}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(222,40%,16%)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(215,20%,55%)' }} tickFormatter={d => d.slice(5)} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(215,20%,55%)' }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={{ background: 'hsl(222,47%,9%)', border: '1px solid hsl(222,40%,16%)' }} formatter={(v: number) => [fmt(v), 'Revenue']} />
                    <Line type="monotone" dataKey="revenue" stroke="hsl(217,91%,60%)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-10">No sales data yet</p>
              )}
            </CardContent>
          </Card>

          {/* Expenses by Category */}
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-sm font-medium">Expenses by Category</CardTitle></CardHeader>
            <CardContent>
              {data.expensesByCategory.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={data.expensesByCategory} dataKey="amount" nameKey="category" cx="50%" cy="50%" outerRadius={80} label={({ category, percent }) => `${category} ${(percent * 100).toFixed(0)}%`}>
                      {data.expensesByCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: 'hsl(222,47%,9%)', border: '1px solid hsl(222,40%,16%)' }} formatter={(v: number) => [fmt(v), 'Amount']} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-10">No expense data yet</p>
              )}
            </CardContent>
          </Card>

          {/* Top Products */}
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-sm font-medium">Top Selling Products</CardTitle></CardHeader>
            <CardContent>
              {data.topProducts.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={data.topProducts} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(222,40%,16%)" />
                    <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(215,20%,55%)' }} />
                    <YAxis type="category" dataKey="productName" width={100} tick={{ fontSize: 10, fill: 'hsl(215,20%,55%)' }} />
                    <Tooltip contentStyle={{ background: 'hsl(222,47%,9%)', border: '1px solid hsl(222,40%,16%)' }} />
                    <Bar dataKey="totalSold" fill="hsl(330,81%,60%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-10">No sales data yet</p>
              )}
            </CardContent>
          </Card>

          {/* Top Customers */}
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-sm font-medium">Top Customers</CardTitle></CardHeader>
            <CardContent>
              {data.topCustomers.length > 0 ? (
                <div className="space-y-3">
                  {data.topCustomers.map((c, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <Users className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{c.customerName}</p>
                          <p className="text-xs text-muted-foreground">{c.phone}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-foreground">{fmt(c.totalSpent)}</p>
                        <p className="text-xs text-muted-foreground">{c.orderCount} orders</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-10">No customer data yet</p>
              )}
            </CardContent>
          </Card>

          {/* Delivery Distance Stats */}
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-sm font-medium flex items-center gap-2"><MapPin className="w-4 h-4" /> Delivery Distances</CardTitle></CardHeader>
            <CardContent>
              {data.deliveryStats.totalDeliveries > 0 ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-foreground">{data.deliveryStats.avgDistanceKm}</p>
                      <p className="text-xs text-muted-foreground">Avg Distance (km)</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-foreground">{data.deliveryStats.totalDeliveries}</p>
                      <p className="text-xs text-muted-foreground">Total Deliveries</p>
                    </div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <div>
                      <p className="text-muted-foreground">Longest</p>
                      <p className="font-semibold text-foreground">{data.deliveryStats.longestKm} km</p>
                    </div>
                    <div className="text-right">
                      <p className="text-muted-foreground">Shortest</p>
                      <p className="font-semibold text-foreground">{data.deliveryStats.shortestKm} km</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-10">No delivery data yet. Add distances in POS.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
