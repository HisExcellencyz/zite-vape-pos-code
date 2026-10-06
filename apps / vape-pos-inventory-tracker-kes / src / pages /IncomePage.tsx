import { useState, useEffect } from 'react';
import { useBranch } from '../hooks/useBranch';
import { getSales, getIncome, exportCsv, importSales, importEntries } from 'zitejs/api';
import { Card, CardContent } from '@project/components/ui/card';
import { Button } from '@project/components/ui/button';
import { Badge } from '@project/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@project/components/ui/tabs';
import { Checkbox } from '@project/components/ui/checkbox';
import { Download, Upload, Receipt, BadgePercent, TrendingUp, Truck, Coins, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { downloadCsv } from '../lib/exportHelper';
import ViewToggle, { useViewMode } from '../components/ViewToggle';
import ImportDialog from '../components/ImportDialog';
import BulkDeductionsDialog from '../components/BulkDeductionsDialog';
import BulkRevenuesDialog from '../components/BulkRevenuesDialog';
import { EditEntryDialog, DeleteEntryDialog, EntryKind } from '../components/EntryDialogs';
import { usePermissions } from '../hooks/usePermissions';
import OtherIncomeDialog from '../components/OtherIncomeDialog';
import { useTableControls, TableControls, SortTh, FieldDef } from '../components/TableControls';
import DateRangeFilter, { Range, inRange } from '../components/DateRangeFilter';
import SummaryTiles from '../components/SummaryTiles';
import { isCashPayment, paymentLabel } from '../lib/payments';
import { isDeliveryFeeIncome, parseRider } from '../lib/delivery';

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
  /** Added on this page: the sale's revenues (delivery fee and others, from its linked Other Income entries). */
  revenues?: number;
  revenueList?: { id: string; name: string; amount: number }[];
  /** Subtotal + Revenues, shown as Total in the list. */
  grandTotal?: number;
}

interface Income { id: string; incomeNumber?: number; incomeDate?: string; description?: string; amount?: number; notes?: string; }

const SF: FieldDef<Sale>[] = [
  { key: 'saleNumber', label: '#' },
  { key: 'saleDate', label: 'Date', get: s => s.saleDate || '' },
  { key: 'paymentMethod', label: 'Payment', get: s => paymentLabel(s.paymentMethod) },
  { key: 'subtotal', label: 'Subtotal' },
  { key: 'revenues', label: 'Revenues' },
  { key: 'grandTotal', label: 'Total' },
  { key: 'deductions', label: 'Deductions' },
  { key: 'rider', label: 'Rider', get: s => parseRider(s.notes) },
  { key: 'status', label: 'Status' },
  { key: 'deliveryAddress', label: 'Delivery' },
  { key: 'notes', label: 'Notes' },
];
const FF: FieldDef<Income>[] = [
  { key: 'incomeNumber', label: '#' }, { key: 'incomeDate', label: 'Date' }, { key: 'description', label: 'Description' },
  { key: 'rider', label: 'Rider', get: i => parseRider(i.notes) }, { key: 'amount', label: 'Amount' },
];
const OF: FieldDef<Income>[] = [
  { key: 'incomeNumber', label: '#' }, { key: 'incomeDate', label: 'Date' }, { key: 'description', label: 'Description' },
  { key: 'amount', label: 'Amount' }, { key: 'notes', label: 'Notes' },
];

const fmt = (n?: number) => `KES ${(n || 0).toLocaleString()}`;

const statusColors: Record<string, string> = {
  Completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  Pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  Voided: 'bg-red-500/10 text-red-400 border-red-500/20',
};

const SALE_LINK = /\s-\sSale\s#(\d+)$/;

/** Revenues of each sale: Other Income entries whose description ends with " - Sale #n" (the delivery fee included). */
function revenuesBySale(income: Income[]) {
  const map = new Map<number, { total: number; list: { id: string; name: string; amount: number }[] }>();
  for (const i of income) {
    const m = SALE_LINK.exec(i.description || '');
    if (!m) continue;
    const n = Number(m[1]);
    const cur = map.get(n) || { total: 0, list: [] };
    cur.total += i.amount || 0;
    cur.list.push({ id: i.id, name: (i.description || '').replace(SALE_LINK, ''), amount: i.amount || 0 });
    map.set(n, cur);
  }
  return map;
}

const q = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

export default function IncomePage() {
  const { currentBranch } = useBranch();
  const { can, canBackdate } = usePermissions();
  const [tab, setTab] = useState('sales');
  const [sales, setSales] = useState<Sale[]>([]);
  const [income, setIncome] = useState<Income[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [viewMode, setViewMode] = useViewMode('sales', 'list');
  const [importOpen, setImportOpen] = useState(false);
  const [showIncome, setShowIncome] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRevOpen, setBulkRevOpen] = useState(false);
  const [editT, setEditT] = useState<{ kind: EntryKind; entry: any } | null>(null);
  const [delT, setDelT] = useState<{ kind: EntryKind; entry: any } | null>(null);
  const [range, setRange] = useState<Range>({});

  const revMap = revenuesBySale(income);
  const salesWithRevenues: Sale[] = sales.map(s => {
    const r = s.saleNumber != null ? revMap.get(s.saleNumber) : undefined;
    const revenues = Math.round((r?.total || 0) * 100) / 100;
    return { ...s, revenues, revenueList: r?.list || [], grandTotal: (s.subtotal || 0) + revenues };
  });
  const dated = salesWithRevenues.filter(x => inRange(range, x.saleDate));
  const fees = income.filter(isDeliveryFeeIncome).filter(x => inRange(range, x.incomeDate));
  const other = income.filter(x => !isDeliveryFeeIncome(x)).filter(x => inRange(range, x.incomeDate));
  const tcS = useTableControls(dated, SF);
  const tcF = useTableControls(fees, FF);
  const tcO = useTableControls(other, OF);
  const rows = tcS.view;
  const live = dated.filter(x => x.status !== 'Voided');
  const sum = (xs: Sale[], k: 'total' | 'deductions') => xs.reduce((a, x) => a + (x[k] || 0), 0);
  const isum = (xs: Income[]) => xs.reduce((a, x) => a + (x.amount || 0), 0);
  const toggleSel = (id: string) => setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const load = async () => {
    setLoading(true);
    try {
      const [s, i] = await Promise.all([
        getSales({ branchId: currentBranch?.id, status: statusFilter && statusFilter !== 'all' ? statusFilter : undefined }),
        getIncome({ branchId: currentBranch?.id, limit: 2000 }),
      ]);
      setSales(s.sales as Sale[]);
      setIncome(i.income as Income[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter, currentBranch?.id]);

  const handleExport = async () => {
    try {
      if (tab === 'sales') {
        const res = await exportCsv({ table: 'sales' });
        downloadCsv(res.csv, res.filename);
      } else {
        const list = tab === 'delivery' ? tcF.view : tcO.view;
        const lines = [['#', 'Date', 'Description', 'Rider', 'Amount', 'Notes'].join(',')].concat(
          list.map(i => [i.incomeNumber, i.incomeDate, i.description, parseRider(i.notes), i.amount, i.notes].map(q).join(',')),
        );
        downloadCsv(lines.join('\n'), tab === 'delivery' ? 'delivery_fees_export.csv' : 'other_income_export.csv');
      }
      toast.success('Exported');
    } catch { toast.error('Export failed'); }
  };

  const runImport = async (rows: Record<string, string>[], adjustStock: boolean) => {
    if (tab === 'other') {
      const r = await importEntries({ kind: 'income', rows });
      return { imported: r.imported, updated: r.updated, skipped: r.skipped, errors: r.errors };
    }
    const res = await importSales({ rows, adjustStock });
    return { imported: res.imported, updated: res.updated, skipped: res.skipped, errors: res.errors };
  };

  const canEdit = can('income', 'edit');
  const canDelete = can('income', 'delete');
  const rowActions = (kind: EntryKind, entry: any) => (canEdit || canDelete) ? (
    <div className="flex justify-end gap-0.5">
      {canEdit && <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Edit" onClick={() => setEditT({ kind, entry })}><Pencil className="w-3.5 h-3.5" /></Button>}
      {canDelete && <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" title="Delete" onClick={() => setDelT({ kind, entry })}><Trash2 className="w-3.5 h-3.5" /></Button>}
    </div>
  ) : null;
  const actionCols = canEdit || canDelete ? 1 : 0;

  const activeControls = (tab === 'sales' ? tcS : tab === 'delivery' ? tcF : tcO) as any;

  // Shared list/grid for Delivery Fees and Other Income
  const renderIncome = (tc: ReturnType<typeof useTableControls<Income>>, showRider: boolean, empty: string, Icon: any) => viewMode === 'list' ? (
    <Card className="bg-card border-border"><CardContent className="p-0"><div className="overflow-auto max-h-[65vh]">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-card"><tr className="border-b border-border text-muted-foreground bg-card">
          <SortTh c={tc} k="incomeNumber" className="text-left">#</SortTh>
          <SortTh c={tc} k="incomeDate" className="text-left">Date</SortTh>
          <SortTh c={tc} k="description" className="text-left">Description</SortTh>
          {showRider && <SortTh c={tc} k="rider" className="text-left">Rider</SortTh>}
          <SortTh c={tc} k="amount" className="text-right">Amount</SortTh>
          {actionCols > 0 && <th className="p-3 w-20" />}
        </tr></thead>
        <tbody>
          {loading ? (
            [...Array(4)].map((_, i) => <tr key={i} className="border-b border-border">{[...Array((showRider ? 5 : 4) + actionCols)].map((_, j) => <td key={j} className="p-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}</tr>)
          ) : tc.view.length === 0 ? (
            <tr><td colSpan={(showRider ? 5 : 4) + actionCols} className="text-center py-12 text-muted-foreground"><Icon className="w-10 h-10 mx-auto mb-2 opacity-40" />{empty}</td></tr>
          ) : tc.view.map(i => (
            <tr key={i.id} className="border-b border-border hover:bg-muted/30">
              <td className="p-3 font-mono text-xs text-muted-foreground">#{i.incomeNumber}</td>
              <td className="p-3 text-foreground whitespace-nowrap">{i.incomeDate ? format(new Date(i.incomeDate), 'dd MMM yyyy HH:mm') : '-'}</td>
              <td className="p-3 text-foreground break-words whitespace-normal max-w-md">{i.description}{!showRider && i.notes ? <span className="block text-xs text-muted-foreground">{i.notes}</span> : null}</td>
              {showRider && <td className="p-3 text-muted-foreground">{parseRider(i.notes) || '-'}</td>}
              <td className="p-3 text-right font-semibold text-emerald-400 whitespace-nowrap">{fmt(i.amount)}</td>
              {actionCols > 0 && <td className="p-3">{rowActions('income', i)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div></CardContent></Card>
  ) : (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
      {tc.view.length === 0 ? (
        <Card className="col-span-full bg-card border-border"><CardContent className="py-12 text-center text-muted-foreground"><Icon className="w-10 h-10 mx-auto mb-2 opacity-40" />{empty}</CardContent></Card>
      ) : tc.view.map(i => (
        <Card key={i.id} className="bg-card border-border"><CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <p className="font-mono text-sm font-semibold text-foreground">#{i.incomeNumber}</p>
            <p className="text-xs text-muted-foreground">{i.incomeDate ? format(new Date(i.incomeDate), 'dd MMM yyyy HH:mm') : '-'}</p>
          </div>
          <p className="text-sm text-foreground break-words whitespace-normal">{i.description}</p>
          {showRider ? (parseRider(i.notes) && <p className="text-xs text-muted-foreground">Rider: {parseRider(i.notes)}</p>) : (i.notes && <p className="text-xs text-muted-foreground break-words">{i.notes}</p>)}
          <div className="border-t border-border pt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Amount</span>
            <span className="text-lg font-bold text-emerald-400 break-words text-right">{fmt(i.amount)}</span>
          </div>
          {actionCols > 0 && <div className="border-t border-border pt-2">{rowActions('income', i)}</div>}
        </CardContent></Card>
      ))}
    </div>
  );

  const tiles =
    tab === 'sales' ? [
      { label: 'Sales Made', value: fmt(sum(live, 'total')), sub: `${live.length} sales` },
      { label: 'Deductions', value: fmt(sum(live, 'deductions')) },
      { label: 'Platform Pay', value: fmt(sum(live.filter(x => !isCashPayment(x.paymentMethod)), 'total')) },
      { label: 'Cash/M-PESA', value: fmt(sum(live.filter(x => isCashPayment(x.paymentMethod)), 'total')) },
    ] : tab === 'delivery' ? [
      { label: 'Delivery Fees', value: fmt(isum(fees)), sub: `${fees.length} orders` },
      { label: 'Average Fee', value: fmt(fees.length ? Math.round(isum(fees) / fees.length) : 0) },
      { label: 'Sales Made', value: fmt(sum(live, 'total')), sub: `${live.length} sales` },
      { label: 'Fees + Sales', value: fmt(isum(fees) + sum(live, 'total')) },
    ] : [
      { label: 'Other Income', value: fmt(isum(other)), sub: `${other.length} records` },
      { label: 'Delivery Fees', value: fmt(isum(fees)), sub: `${fees.length} orders` },
      { label: 'Sales Made', value: fmt(sum(live, 'total')) },
      { label: 'Total Income', value: fmt(sum(live, 'total') + isum(fees) + isum(other)) },
    ];

  return (
    <div className="p-6 space-y-6">
      <div className="sticky top-0 z-20 -mx-6 -mt-6 px-6 pt-6 pb-4 space-y-4 bg-background/95 backdrop-blur border-b border-border">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Income</h1>
          <p className="text-sm text-muted-foreground">
            {tab === 'sales' ? `${rows.length} of ${sales.length} sales records` : tab === 'delivery' ? `${fees.length} delivery fees` : `${other.length} other income records`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {tab === 'sales' && selected.length > 0 && canEdit && (
            <>
              <Button size="sm" variant="outline" className="border-sky-500 text-sky-400" onClick={() => setBulkOpen(true)}>
                <BadgePercent className="w-4 h-4 mr-1" /> Deductions ({selected.length})
              </Button>
              <Button size="sm" variant="outline" className="border-emerald-500 text-emerald-400" onClick={() => setBulkRevOpen(true)}>
                <Coins className="w-4 h-4 mr-1" /> Revenues ({selected.length})
              </Button>
            </>
          )}
          <ViewToggle value={viewMode} onChange={setViewMode} />
          {can('income', 'export') && <Button variant="outline" size="sm" className="border-pink-500 text-pink-400 hover:bg-pink-500/10" onClick={handleExport}><Download className="w-4 h-4 mr-1" /> Export</Button>}
          {can('income', 'import') && (tab === 'sales' || tab === 'other') && (
            <Button variant="outline" size="sm" className="border-green-500 text-green-400 hover:bg-green-500/10" onClick={() => setImportOpen(true)}><Upload className="w-4 h-4 mr-1" /> Import</Button>
          )}
          {tab === 'other' && can('income', 'create') && (
            <Button size="sm" onClick={() => setShowIncome(true)}><TrendingUp className="w-4 h-4 mr-1" /> Add Other Income</Button>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 flex flex-wrap gap-2 items-center">
          <DateRangeFilter value={range} onChange={setRange} />
          <TableControls c={activeControls} />
        </div>
        {tab === 'sales' && (
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="Completed">Completed</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Voided">Voided</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>
      <SummaryTiles items={tiles} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted">
          <TabsTrigger value="sales">Sales ({dated.length})</TabsTrigger>
          <TabsTrigger value="delivery">Delivery Fees ({fees.length})</TabsTrigger>
          <TabsTrigger value="other">Other Income ({other.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="mt-4">
          {viewMode === 'list' ? (
            <Card className="bg-card border-border">
              <CardContent className="p-0">
                <div className="overflow-auto max-h-[65vh]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-card">
                      <tr className="border-b border-border text-muted-foreground bg-card">
                        <th className="p-3 w-8"><Checkbox checked={rows.length > 0 && selected.length === rows.length} onCheckedChange={v => setSelected(v ? rows.map(x => x.id) : [])} /></th>
                        <SortTh c={tcS} k="saleNumber" className="text-left">#</SortTh>
                        <SortTh c={tcS} k="saleDate" className="text-left">Date</SortTh>
                        <SortTh c={tcS} k="paymentMethod" className="text-left">Payment</SortTh>
                        <SortTh c={tcS} k="subtotal" className="text-right">Subtotal</SortTh>
                        <SortTh c={tcS} k="revenues" className="text-right">Revenues</SortTh>
                        <SortTh c={tcS} k="grandTotal" className="text-right">Total</SortTh>
                        <SortTh c={tcS} k="deductions" className="text-right">Deductions</SortTh>
                        <SortTh c={tcS} k="rider" className="text-left">Rider</SortTh>
                        <SortTh c={tcS} k="status" className="text-center">Status</SortTh>
                        {actionCols > 0 && <th className="p-3 w-20" />}
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        [...Array(5)].map((_, i) => (
                          <tr key={i} className="border-b border-border">
                            {[...Array(10 + actionCols)].map((_, j) => <td key={j} className="p-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}
                          </tr>
                        ))
                      ) : rows.length === 0 ? (
                        <tr>
                          <td colSpan={10 + actionCols} className="text-center py-12 text-muted-foreground">
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
                          <td className="p-3 text-right text-emerald-400 whitespace-nowrap">{s.revenues ? `+${fmt(s.revenues)}` : '-'}</td>
                          <td className="p-3 text-right font-semibold text-foreground whitespace-nowrap">{fmt(s.grandTotal)}</td>
                          <td className="p-3 text-right text-pink-400 whitespace-nowrap">{s.deductions ? `-${fmt(s.deductions)}` : '-'}</td>
                          <td className="p-3 text-muted-foreground break-words">{parseRider(s.notes) || '-'}</td>
                          <td className="p-3 text-center">
                            <Badge variant="secondary" className={statusColors[s.status || ''] || ''}>{s.status}</Badge>
                          </td>
                          {actionCols > 0 && <td className="p-3">{rowActions('sale', s)}</td>}
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
                          {!!s.revenues && <p className="text-xs text-emerald-400">Revenues +{fmt(s.revenues)}</p>}
                          {!!s.deductions && <p className="text-xs text-pink-400">Deductions -{fmt(s.deductions)}</p>}
                          {parseRider(s.notes) && <p className="text-xs text-muted-foreground">Rider: {parseRider(s.notes)}</p>}
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
                      <span className="text-lg font-bold text-primary break-words text-right">{fmt(s.grandTotal)}</span>
                    </div>
                    {actionCols > 0 && <div className="border-t border-border pt-2">{rowActions('sale', s)}</div>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="delivery" className="mt-4">
          {renderIncome(tcF, true, 'No delivery fees recorded yet. They are added automatically when a sale is completed at POS.', Truck)}
        </TabsContent>

        <TabsContent value="other" className="mt-4">
          {renderIncome(tcO, false, 'No other income recorded', TrendingUp)}
        </TabsContent>
      </Tabs>

      <OtherIncomeDialog open={showIncome} onOpenChange={setShowIncome} onSaved={() => { setTab('other'); load(); }} />

      <BulkRevenuesDialog open={bulkRevOpen} onOpenChange={setBulkRevOpen} saleIds={selected} presets={currentBranch?.incomes || []} onDone={() => { setSelected([]); load(); }} />
      <EditEntryDialog open={!!editT} onOpenChange={o => { if (!o) setEditT(null); }} kind={editT?.kind || 'income'} entry={editT?.entry || null} onSaved={load} />
      <DeleteEntryDialog open={!!delT} onOpenChange={o => { if (!o) setDelT(null); }} kind={delT?.kind || 'income'} entry={delT?.entry || null} onDone={load} />

      <BulkDeductionsDialog open={bulkOpen} onOpenChange={setBulkOpen} saleIds={selected} presets={currentBranch?.commissions || []} onDone={() => { setSelected([]); load(); }} />

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title={tab === 'other' ? 'Import Other Income' : 'Import Sales'}
        template={tab === 'other' ? 'income' : 'sales'}
        optionLabel={tab === 'other' ? undefined : 'Also deduct the imported quantities from current stock (leave off for old sales already reflected in your stock counts)'}
        description={tab === 'other' ? <>
          Upload a CSV with one row per income entry. Columns: <span className="font-medium text-foreground">Description, Amount, Notes</span>
          {canBackdate && <>, plus <span className="font-medium text-foreground">Date</span> (YYYY-MM-DD or DD/MM/YYYY) for backdated entries, and <span className="font-medium text-foreground">Entry Number</span> to change the date (or details) of an existing entry</>}.
          {!canBackdate && <> Entries are dated today. Only the Owner and Admin can import backdated or re-dated entries.</>} Press OK to start.
        </> : <>
          Upload a CSV with one row per product line. Rows sharing the same <span className="font-medium text-foreground">Sale Ref</span> become one sale.
          Columns: <span className="font-medium text-foreground">Sale Ref, Date, Customer Name, Customer Phone, Payment Method, Product SKU, Quantity, Unit Price, Discount, Notes</span>.
          <br />The <span className="font-medium text-foreground">Date</span> can be in the past (YYYY-MM-DD or DD/MM/YYYY, optionally with a time like 14:30); leave it empty to use today. Products are matched by SKU. Sale Refs already imported are skipped.
          {canBackdate
            ? <> To change the date of an existing sale, add a row with its <span className="font-medium text-foreground">Sale Number</span> and the new Date (its delivery fee / revenues move too).</>
            : <> Only the Owner and Admin can import backdated sales or change sale dates; your file must be dated today (leave Date empty).</>} Press OK to start.
        </>}
        onImport={runImport}
        onDone={load}
      />
    </div>
  );
}
