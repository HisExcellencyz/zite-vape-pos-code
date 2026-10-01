import { useState, useEffect } from 'react';
import { useBranch } from '../hooks/useBranch';
import { getSales, exportCsv, importSales } from 'zitejs/api';
import { Card, CardContent } from '@project/components/ui/card';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Badge } from '@project/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Download, Upload, Receipt, BadgePercent } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { downloadCsv } from '../lib/exportHelper';
import ViewToggle, { useViewMode } from '../components/ViewToggle';
import ImportDialog from '../components/ImportDialog';
import BulkDeductionsDialog from '../components/BulkDeductionsDialog';
import { Checkbox } from '@project/components/ui/checkbox';
import { useTableControls, TableControls, SortTh, FieldDef } from '../components/TableControls';
import DateRangeFilter, { Range, inRange } from '../components/DateRangeFilter';
import SummaryTiles from '../components/SummaryTiles';
import { isCashPayment, paymentLabel } from '../lib/payments';

const FIELDS: FieldDef<Sale>[] = [
  { key: 'saleNumber', label: '#' },
  { key: 'saleDate', label: 'Date', get: s => s.saleDate || '' },
  { key: 'paymentMethod', label: 'Payment', get: s => paymentLabel(s.paymentMethod) },
  { key: 'subtotal', label: 'Subtotal' },
  { key: 'total', label: 'Total' },
  { key: 'deductions', label: 'Deductions' },
  { key: 'status', label: 'Status' },
  { key: 'deliveryAddress', label: 'Delivery' },
  { key: 'notes', label: 'Notes' },
];

interface Sale {
  id: string;
  saleNumber?: number;
  saleDate?: string;
  total?: number;
  subtotal?: number;
  status?: string;
  paymentMethod?: string;
  deductions?: number;
  deliveryAddress?: string;
  notes?: string;
}

const fmt = (n?: number) => `KES ${(n || 0).toLocaleString()}`;

const statusColors: Record<string, string> = {
  Completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  Pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  Voided: 'bg-red-500/10 text-red-400 border-red-500/20',
};

export default function SalesPage() {
  const { currentBranch } = useBranch();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const search = '';
  const [statusFilter, setStatusFilter] = useState('');
  const [viewMode, setViewMode] = useViewMode('sales', 'list');
  const [importOpen, setImportOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [range, setRange] = useState<Range>({});
  const dated = sales.filter(x => inRange(range, x.saleDate));
  const tc = useTableControls(dated, FIELDS);
  const rows = tc.view;
  const live = dated.filter(x => x.status !== 'Voided');
  const sum = (xs: Sale[], k: 'total' | 'deductions') => xs.reduce((a, x) => a + (x[k] || 0), 0);
  const toggleSel = (id: string) => setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getSales({ branchId: currentBranch?.id, search, status: statusFilter && statusFilter !== 'all' ? statusFilter : undefined });
      setSales(res.sales as Sale[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter, currentBranch?.id]);

  const handleExport = async () => {
    try {
      const res = await exportCsv({ table: 'sales' });
      downloadCsv(res.csv, res.filename);
      toast.success('Exported');
    } catch { toast.error('Export failed'); }
  };

  const runImport = async (rows: Record<string, string>[], adjustStock: boolean) => {
    const res = await importSales({ rows, adjustStock });
    return { imported: res.imported, skipped: res.skipped, errors: res.errors };
  };

  return (
    <div className="p-6 space-y-6">
      <div className="sticky top-0 z-20 -mx-6 -mt-6 px-6 pt-6 pb-4 space-y-4 bg-background/95 backdrop-blur border-b border-border">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sales</h1>
          <p className="text-sm text-muted-foreground">{rows.length} of {sales.length} sales records</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {selected.length > 0 && (
            <Button size="sm" variant="outline" className="border-sky-500 text-sky-400" onClick={() => setBulkOpen(true)}>
              <BadgePercent className="w-4 h-4 mr-1" /> Deductions ({selected.length})
            </Button>
          )}
          <ViewToggle value={viewMode} onChange={setViewMode} />
          <Button variant="outline" size="sm" className="border-pink-500 text-pink-400 hover:bg-pink-500/10" onClick={handleExport}><Download className="w-4 h-4 mr-1" /> Export</Button>
          <Button variant="outline" size="sm" className="border-green-500 text-green-400 hover:bg-green-500/10" onClick={() => setImportOpen(true)}><Upload className="w-4 h-4 mr-1" /> Import</Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 flex flex-wrap gap-2 items-center">
          <DateRangeFilter value={range} onChange={setRange} />
          <TableControls c={tc} />
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
      <SummaryTiles items={[
        { label: 'Sales Made', value: fmt(sum(live, 'total')), sub: `${live.length} sales` },
        { label: 'Deductions', value: fmt(sum(live, 'deductions')) },
        { label: 'Platform Pay', value: fmt(sum(live.filter(x => !isCashPayment(x.paymentMethod)), 'total')) },
        { label: 'Cash/M-PESA', value: fmt(sum(live.filter(x => isCashPayment(x.paymentMethod)), 'total')) },
      ]} />
      </div>

      {viewMode === 'list' ? (
        <Card className="bg-card border-border">
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[65vh]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-border text-muted-foreground bg-card">
                    <th className="p-3 w-8"><Checkbox checked={rows.length > 0 && selected.length === rows.length} onCheckedChange={v => setSelected(v ? rows.map(x => x.id) : [])} /></th>
                    <SortTh c={tc} k="saleNumber" className="text-left">#</SortTh>
                    <SortTh c={tc} k="saleDate" className="text-left">Date</SortTh>
                    <SortTh c={tc} k="paymentMethod" className="text-left">Payment</SortTh>
                    <SortTh c={tc} k="subtotal" className="text-right">Subtotal</SortTh>
                    <SortTh c={tc} k="total" className="text-right">Total</SortTh>
                    <SortTh c={tc} k="deductions" className="text-right">Deductions</SortTh>
                    <SortTh c={tc} k="status" className="text-center">Status</SortTh>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [...Array(5)].map((_, i) => (
                      <tr key={i} className="border-b border-border">
                        {[...Array(8)].map((_, j) => <td key={j} className="p-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}
                      </tr>
                    ))
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-muted-foreground">
                        <Receipt className="w-10 h-10 mx-auto mb-2 opacity-40" />
                        No sales yet. Create your first sale in POS or import a file.
                      </td>
                    </tr>
                  ) : rows.map(s => (
                    <tr key={s.id} className="border-b border-border hover:bg-muted/30">
                      <td className="p-3"><Checkbox checked={selected.includes(s.id)} onCheckedChange={() => toggleSel(s.id)} /></td>
                      <td className="p-3 font-mono text-xs text-muted-foreground">#{s.saleNumber}</td>
                      <td className="p-3 text-foreground">{s.saleDate ? format(new Date(s.saleDate), 'dd MMM yyyy HH:mm') : '-'}</td>
                      <td className="p-3 text-muted-foreground break-words">{paymentLabel(s.paymentMethod)}</td>
                      <td className="p-3 text-right text-muted-foreground whitespace-nowrap">{fmt(s.subtotal)}</td>
                      <td className="p-3 text-right font-semibold text-foreground whitespace-nowrap">{fmt(s.total)}</td>
                      <td className="p-3 text-right text-pink-400 whitespace-nowrap">{s.deductions ? `-${fmt(s.deductions)}` : '-'}</td>
                      <td className="p-3 text-center">
                        <Badge variant="secondary" className={statusColors[s.status || ''] || ''}>{s.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {loading ? (
            [...Array(4)].map((_, i) => (
              <Card key={i} className="bg-card border-border"><CardContent className="p-4"><div className="h-24 bg-muted rounded animate-pulse" /></CardContent></Card>
            ))
          ) : rows.length === 0 ? (
            <Card className="col-span-full bg-card border-border">
              <CardContent className="py-12 text-center text-muted-foreground">
                <Receipt className="w-10 h-10 mx-auto mb-2 opacity-40" />
                No sales yet. Create your first sale in POS or import a file.
              </CardContent>
            </Card>
          ) : rows.map(s => (
            <Card key={s.id} className="bg-card border-border">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex gap-2 items-start">
                    <Checkbox className="mt-0.5" checked={selected.includes(s.id)} onCheckedChange={() => toggleSel(s.id)} />
                    <div>
                    <p className="font-mono text-sm font-semibold text-foreground">#{s.saleNumber}</p>
                    <p className="text-xs text-muted-foreground break-words">{s.saleDate ? format(new Date(s.saleDate), 'dd MMM yyyy HH:mm') : '-'}</p>
                    {!!s.deductions && <p className="text-xs text-pink-400">Deductions -{fmt(s.deductions)}</p>}
                    </div>
                  </div>
                  <Badge variant="secondary" className={`shrink-0 ${statusColors[s.status || ''] || ''}`}>{s.status}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="min-w-0">
                    <p className="text-muted-foreground">Payment</p>
                    <p className="font-medium text-foreground break-words">{paymentLabel(s.paymentMethod)}</p>
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

      <BulkDeductionsDialog open={bulkOpen} onOpenChange={setBulkOpen} saleIds={selected} presets={currentBranch?.commissions || []} onDone={() => { setSelected([]); load(); }} />

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import Sales"
        template="sales"
        optionLabel="Also deduct the imported quantities from current stock (leave off for old sales already reflected in your stock counts)"
        description={<>
          Upload a CSV with one row per product line. Rows sharing the same <span className="font-medium text-foreground">Sale Ref</span> become one sale.
          Columns: <span className="font-medium text-foreground">Sale Ref, Date, Customer Name, Customer Phone, Payment Method, Product SKU, Quantity, Unit Price, Discount, Notes</span>.
          <br />The <span className="font-medium text-foreground">Date</span> can be in the past (YYYY-MM-DD or DD/MM/YYYY, optionally with a time like 14:30); leave it empty to use today. Products are matched by SKU. Sale Refs already imported are skipped. Press OK to start.
        </>}
        onImport={runImport}
        onDone={load}
      />
    </div>
  );
}
