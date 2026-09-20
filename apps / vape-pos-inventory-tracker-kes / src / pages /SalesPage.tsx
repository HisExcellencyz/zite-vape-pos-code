import { useState, useEffect } from 'react';
import { getSales } from 'zitejs/api';
import { Card, CardContent } from '@project/components/ui/card';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Badge } from '@project/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Search, Download, Receipt } from 'lucide-react';
import { format } from 'date-fns';
import ViewToggle, { useViewMode } from '../components/ViewToggle';

interface Sale {
  id: string;
  saleNumber?: number;
  saleDate?: string;
  total?: number;
  subtotal?: number;
  status?: string;
  paymentMethod?: string;
}

const fmt = (n?: number) => `KES ${(n || 0).toLocaleString()}`;

const statusColors: Record<string, string> = {
  Completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  Pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  Voided: 'bg-red-500/10 text-red-400 border-red-500/20',
};

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [viewMode, setViewMode] = useViewMode('sales', 'list');

  const load = async () => {
    setLoading(true);
    try {
      const res = await getSales({ search, status: statusFilter || undefined });
      setSales(res.sales as Sale[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sales</h1>
          <p className="text-sm text-muted-foreground">{sales.length} sales records</p>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle value={viewMode} onChange={setViewMode} />
          <Button variant="outline" size="sm" className="border-pink-500 text-pink-400 hover:bg-pink-500/10"><Download className="w-4 h-4 mr-1" /> Export</Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search sales..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Completed">Completed</SelectItem>
            <SelectItem value="Pending">Pending</SelectItem>
            <SelectItem value="Voided">Voided</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {viewMode === 'list' ? (
        <Card className="bg-card border-border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left p-3 font-medium">#</th>
                    <th className="text-left p-3 font-medium">Date</th>
                    <th className="text-left p-3 font-medium">Payment</th>
                    <th className="text-right p-3 font-medium">Subtotal</th>
                    <th className="text-right p-3 font-medium">Total</th>
                    <th className="text-center p-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [...Array(5)].map((_, i) => (
                      <tr key={i} className="border-b border-border">
                        {[...Array(6)].map((_, j) => <td key={j} className="p-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}
                      </tr>
                    ))
                  ) : sales.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-muted-foreground">
                        <Receipt className="w-10 h-10 mx-auto mb-2 opacity-40" />
                        No sales yet. Create your first sale in POS.
                      </td>
                    </tr>
                  ) : sales.map(s => (
                    <tr key={s.id} className="border-b border-border hover:bg-muted/30">
                      <td className="p-3 font-mono text-xs text-muted-foreground">#{s.saleNumber}</td>
                      <td className="p-3 text-foreground">{s.saleDate ? format(new Date(s.saleDate), 'dd MMM yyyy HH:mm') : '-'}</td>
                      <td className="p-3 text-muted-foreground break-words">{s.paymentMethod}</td>
                      <td className="p-3 text-right text-muted-foreground whitespace-nowrap">{fmt(s.subtotal)}</td>
                      <td className="p-3 text-right font-semibold text-foreground whitespace-nowrap">{fmt(s.total)}</td>
                      <td className="p-3 text-center">
                        <Badge variant="secondary" className={statusColors[s.status || ''] || ''}>
                          {s.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {loading ? (
            [...Array(4)].map((_, i) => (
              <Card key={i} className="bg-card border-border"><CardContent className="p-4"><div className="h-24 bg-muted rounded animate-pulse" /></CardContent></Card>
            ))
          ) : sales.length === 0 ? (
            <Card className="col-span-full bg-card border-border">
              <CardContent className="py-12 text-center text-muted-foreground">
                <Receipt className="w-10 h-10 mx-auto mb-2 opacity-40" />
                No sales yet. Create your first sale in POS.
              </CardContent>
            </Card>
          ) : sales.map(s => (
            <Card key={s.id} className="bg-card border-border">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold text-foreground">#{s.saleNumber}</p>
                    <p className="text-xs text-muted-foreground break-words">{s.saleDate ? format(new Date(s.saleDate), 'dd MMM yyyy HH:mm') : '-'}</p>
                  </div>
                  <Badge variant="secondary" className={`shrink-0 ${statusColors[s.status || ''] || ''}`}>{s.status}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="min-w-0">
                    <p className="text-muted-foreground">Payment</p>
                    <p className="font-medium text-foreground break-words">{s.paymentMethod || '-'}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-muted-foreground">Subtotal</p>
                    <p className="font-medium text-foreground break-words">{fmt(s.subtotal)}</p>
                  </div>
                </div>
                <div className="border-t border-border pt-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Total</span>
                  <span className="text-lg font-bold text-primary break-words text-right">{fmt(s.total)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
