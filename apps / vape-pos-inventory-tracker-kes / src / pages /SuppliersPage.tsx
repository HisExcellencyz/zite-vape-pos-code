import { useState, useEffect } from 'react';
import { getSuppliers, saveSupplier, deleteRecord, exportCsv, importCsv, bulkDeleteRecords, getSupplierDetails, recordDeposit, manageSupplierBills, getAddresses, saveAddress, syncSupplierAddresses } from 'zitejs/api';
import { Card, CardContent } from '@project/components/ui/card';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Badge } from '@project/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@project/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@project/components/ui/tabs';
import { DatePicker } from '@project/components/ui/date-picker';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@project/components/ui/alert-dialog';
import { Plus, Download, Upload, Truck, Pencil, Trash2, MapPin, CheckSquare, Phone, Mail, Wallet, Receipt, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { downloadCsv } from '../lib/exportHelper';
import LocationPickerDialog from '../components/LocationPickerDialog';
import ViewToggle, { useViewMode } from '../components/ViewToggle';
import ImportDialog from '../components/ImportDialog';
import { usePermissions } from '../hooks/usePermissions';

interface Supplier {
  id: string;
  supplierName?: string;
  phone?: string;
  email?: string;
  address?: string;
  depositBalance?: number;
  billsPending?: number;
  billCount?: number;
  locationCount?: number;
}

interface Bill {
  id: string;
  amount: number;
  notes?: string | null;
  date: string;
  status: 'pending' | 'paid';
  source: 'manual' | 'pickup';
  items?: { name: string; quantity: number; unitCost: number }[];
  paidFrom?: 'cash' | 'deposit' | null;
}

import { useTableControls, TableControls, SortTh, FieldDef } from '../components/TableControls';

const FIELDS: FieldDef<Supplier>[] = [{ key: 'supplierName', label: 'Name' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' }, { key: 'address', label: 'Address' }, { key: 'depositBalance', label: 'Deposit Balance' }, { key: 'billsPending', label: 'Bills Pending' }];

const fmt = (n?: number) => `KES ${(n || 0).toLocaleString()}`;
const dateTxt = (d?: string | null) => { try { return d ? format(new Date(d), 'dd MMM yyyy') : '-'; } catch { return '-'; } };

export default function SuppliersPage() {
  const { can } = usePermissions();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const tc = useTableControls(suppliers, FIELDS);
  const [viewMode, setViewMode] = useViewMode('suppliers', 'grid');

  // Supplier account dialog (transactions, bills, locations)
  const [acct, setAcct] = useState<Supplier | null>(null);
  const [acctTab, setAcctTab] = useState('transactions');
  const [txs, setTxs] = useState<any[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [locs, setLocs] = useState<any[]>([]);
  const [acctLoading, setAcctLoading] = useState(false);

  // Deposit / bill / location sub-dialogs
  const [depositOpen, setDepositOpen] = useState(false);
  const [depAmount, setDepAmount] = useState('');
  const [depNotes, setDepNotes] = useState('');
  const [billOpen, setBillOpen] = useState(false);
  const [billAmount, setBillAmount] = useState('');
  const [billNotes, setBillNotes] = useState('');
  const [billDate, setBillDate] = useState<Date | undefined>(new Date());
  const [locOpen, setLocOpen] = useState(false);
  const [locName, setLocName] = useState('');
  const [locAddress, setLocAddress] = useState('');
  const [locCoords, setLocCoords] = useState('');
  const [showLocPicker2, setShowLocPicker2] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getSuppliers({ search });
      setSuppliers(res.suppliers as Supplier[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [search]);

  // Every supplier also has a Supplier-type location on the Addresses page: back-fill older ones once.
  useEffect(() => { syncSupplierAddresses({}).then(r => { if (r.created > 0) load(); }).catch(() => {}); }, []);

  const refreshAcct = async (id: string) => {
    setAcctLoading(true);
    try {
      const [d, b, l] = await Promise.all([
        getSupplierDetails({ supplierId: id }),
        manageSupplierBills({ action: 'list', supplierId: id }),
        getAddresses({ supplierId: id }),
      ]);
      setAcct(prev => (prev ? { ...prev, ...(d.supplier as Supplier), billsPending: b.pending } : prev));
      setTxs(d.transactions);
      setBills(b.bills as Bill[]);
      setLocs(l.addresses);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load supplier account');
    } finally {
      setAcctLoading(false);
    }
  };

  const openAccount = (s: Supplier, tab = 'transactions') => {
    setAcct(s);
    setAcctTab(tab);
    setTxs([]); setBills([]); setLocs([]);
    refreshAcct(s.id);
  };

  const afterChange = async () => {
    if (acct) await refreshAcct(acct.id);
    load();
  };

  const handleDeposit = async () => {
    if (!acct) return;
    if (!(Number(depAmount) > 0)) return toast.error('Enter a deposit amount greater than 0');
    setBusy(true);
    try {
      await recordDeposit({ supplierId: acct.id, amount: Number(depAmount), notes: depNotes || undefined });
      toast.success('Deposit recorded');
      setDepositOpen(false); setDepAmount(''); setDepNotes('');
      await afterChange();
    } catch (e: any) { toast.error(e.message || 'Failed'); } finally { setBusy(false); }
  };

  const handleAddBill = async () => {
    if (!acct) return;
    if (!(Number(billAmount) > 0)) return toast.error('Enter a bill amount greater than 0');
    setBusy(true);
    try {
      await manageSupplierBills({
        action: 'add',
        supplierId: acct.id,
        amount: Number(billAmount),
        notes: billNotes || undefined,
        date: (billDate || new Date()).toISOString(),
        source: 'manual',
      });
      toast.success('Bill recorded');
      setBillOpen(false); setBillAmount(''); setBillNotes(''); setBillDate(new Date());
      setAcctTab('bills');
      await afterChange();
    } catch (e: any) { toast.error(e.message || 'Failed'); } finally { setBusy(false); }
  };

  const handlePayBill = async (b: Bill, fromDeposit: boolean) => {
    setBusy(true);
    try {
      await manageSupplierBills({ action: 'pay', billId: b.id, fromDeposit });
      toast.success(fromDeposit ? 'Bill paid from deposit' : 'Bill marked as paid');
      await afterChange();
    } catch (e: any) { toast.error(e.message || 'Failed'); } finally { setBusy(false); }
  };

  const handleDeleteBill = async (b: Bill) => {
    try {
      await manageSupplierBills({ action: 'delete', billId: b.id });
      toast.success('Bill deleted');
      await afterChange();
    } catch (e: any) { toast.error(e.message || 'Failed'); }
  };

  const handleAddLocation = async () => {
    if (!acct) return;
    if (!locName.trim()) return toast.error('Location name is required');
    setBusy(true);
    try {
      await saveAddress({
        addressName: locName.trim(),
        type: 'supplier',
        supplierId: acct.id,
        fullAddress: locAddress || undefined,
        coordinates: locCoords || undefined,
      });
      toast.success('Location added (also shown on the Addresses page)');
      setLocOpen(false); setLocName(''); setLocAddress(''); setLocCoords('');
      setAcctTab('locations');
      await afterChange();
    } catch (e: any) { toast.error(e.message || 'Failed'); } finally { setBusy(false); }
  };

  const handleDeleteLocation = async (id: string) => {
    try {
      await deleteRecord({ table: 'addresses', id });
      toast.success('Location deleted');
      await afterChange();
    } catch { toast.error('Failed'); }
  };

  const openNew = () => {
    setEditing(null);
    setFormName(''); setFormPhone(''); setFormEmail(''); setFormAddress('');
    setShowForm(true);
  };

  const openEdit = (s: Supplier) => {
    setEditing(s);
    setFormName(s.supplierName || '');
    setFormPhone(s.phone || '');
    setFormEmail(s.email || '');
    setFormAddress(s.address || '');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formName) return toast.error('Supplier name is required');
    setSaving(true);
    try {
      await saveSupplier({
        id: editing?.id,
        supplierName: formName,
        phone: formPhone || undefined,
        email: formEmail || undefined,
        address: formAddress || undefined,
      });
      toast.success(editing ? 'Supplier updated' : 'Supplier created');
      setShowForm(false);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRecord({ table: 'suppliers', id });
      toast.success('Supplier deleted');
      load();
    } catch { toast.error('Failed'); }
  };

  const handleExport = async () => {
    try {
      const res = await exportCsv({ table: 'suppliers' });
      downloadCsv(res.csv, res.filename);
      toast.success('Exported');
    } catch { toast.error('Export failed'); }
  };

  const runImport = async (rows: Record<string, string>[]) => {
    const res = await importCsv({ table: 'suppliers', rows });
    return { imported: res.imported, updated: res.updated, errors: res.errors };
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    setSelectedIds(selectedIds.size === suppliers.length ? new Set() : new Set(suppliers.map(s => s.id)));
  };

  const handleBulkDelete = async () => {
    try {
      const res = await bulkDeleteRecords({ table: 'suppliers', ids: Array.from(selectedIds) });
      toast.success(`Deleted ${res.deleted} suppliers`);
      setSelectedIds(new Set());
      load();
    } catch { toast.error('Bulk delete failed'); }
  };

  const renderActions = (s: Supplier) => (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" title="Account: deposits, bills & locations" onClick={() => openAccount(s)}><Wallet className="w-3.5 h-3.5" /></Button>
      {can('suppliers', 'edit') && <Button variant="ghost" size="sm" onClick={() => openEdit(s)}><Pencil className="w-3.5 h-3.5" /></Button>}
      {can('suppliers', 'delete') && <AlertDialog>
        <AlertDialogTrigger asChild><Button variant="ghost" size="sm" className="text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button></AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete supplier?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete {s.supplierName}.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleDelete(s.id)} className="bg-destructive">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>}
    </div>
  );

  const acctPending = bills.filter(b => b.status === 'pending').reduce((s, b) => s + b.amount, 0);

  return (
    <div className="p-6 space-y-6">
      <div className="sticky top-0 z-20 -mx-6 -mt-6 px-6 pt-6 pb-4 space-y-4 bg-background/95 backdrop-blur border-b border-border">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Suppliers</h1>
          <p className="text-sm text-muted-foreground">{suppliers.length} suppliers</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ViewToggle value={viewMode} onChange={setViewMode} />
          {selectedIds.size > 0 && can('suppliers', 'delete') && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="border-destructive text-destructive hover:bg-destructive/10">
                  <CheckSquare className="w-4 h-4 mr-1" /> Delete Selected ({selectedIds.size})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {selectedIds.size} suppliers?</AlertDialogTitle>
                  <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive">Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {can('suppliers', 'export') && <Button variant="outline" size="sm" className="border-pink-500 text-pink-400 hover:bg-pink-500/10" onClick={handleExport}><Download className="w-4 h-4 mr-1" /> Export</Button>}
          {can('suppliers', 'import') && <Button variant="outline" size="sm" className="border-green-500 text-green-400 hover:bg-green-500/10" onClick={() => setImportOpen(true)}><Upload className="w-4 h-4 mr-1" /> Import</Button>}
          {can('suppliers', 'create') && <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Add Supplier</Button>}
        </div>
      </div>

      <TableControls c={tc} />
      </div>

      {viewMode === 'list' ? (
        <Card className="bg-card border-border">
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[65vh]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-border text-muted-foreground bg-card">
                    <th className="p-3 w-8"><input type="checkbox" checked={selectedIds.size === suppliers.length && suppliers.length > 0} onChange={toggleSelectAll} className="rounded" /></th>
                    <SortTh c={tc} k="supplierName" className="text-left">Name</SortTh>
                    <SortTh c={tc} k="phone" className="text-left">Phone</SortTh>
                    <SortTh c={tc} k="email" className="text-left">Email</SortTh>
                    <SortTh c={tc} k="depositBalance" className="text-right">Deposit Balance</SortTh>
                    <SortTh c={tc} k="billsPending" className="text-right">Bills Pending</SortTh>
                    <th className="text-right p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [...Array(5)].map((_, i) => (
                      <tr key={i} className="border-b border-border">
                        <td className="p-3"></td>
                        {[...Array(6)].map((_, j) => <td key={j} className="p-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}
                      </tr>
                    ))
                  ) : tc.view.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-muted-foreground">
                        <Truck className="w-10 h-10 mx-auto mb-2 opacity-40" />
                        No suppliers found
                      </td>
                    </tr>
                  ) : tc.view.map(s => (
                    <tr key={s.id} className="border-b border-border hover:bg-muted/30">
                      <td className="p-3"><input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelect(s.id)} className="rounded" /></td>
                      <td className="p-3 font-medium text-foreground break-words whitespace-normal">{s.supplierName}</td>
                      <td className="p-3 text-muted-foreground whitespace-nowrap">{s.phone || '-'}</td>
                      <td className="p-3 text-muted-foreground break-all">{s.email || '-'}</td>
                      <td className="p-3 text-right font-semibold text-primary whitespace-nowrap">{fmt(s.depositBalance)}</td>
                      <td className="p-3 text-right font-semibold whitespace-nowrap text-pink-400">{fmt(s.billsPending)}</td>
                      <td className="p-3 text-right">{renderActions(s)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {suppliers.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground select-none w-fit cursor-pointer">
              <input type="checkbox" checked={selectedIds.size === suppliers.length} onChange={toggleSelectAll} className="rounded" />
              Select all
            </label>
          )}
          {/* Narrower, taller tiles: more per row; deposit balance with bills pending beneath it */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 items-stretch">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <Card key={i} className="bg-card border-border"><CardContent className="p-4"><div className="h-48 bg-muted rounded animate-pulse" /></CardContent></Card>
              ))
            ) : tc.view.length === 0 ? (
              <Card className="col-span-full bg-card border-border">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Truck className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  No suppliers found
                </CardContent>
              </Card>
            ) : tc.view.map(s => (
              <Card key={s.id} className={`bg-card flex flex-col ${selectedIds.has(s.id) ? 'border-primary' : 'border-border'}`}>
                <CardContent className="p-3 flex flex-col gap-2.5 flex-1">
                  <div className="flex items-start gap-2">
                    <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelect(s.id)} className="mt-1 rounded shrink-0" />
                    <p className="font-semibold text-foreground break-words whitespace-normal leading-snug min-w-0 flex-1">{s.supplierName}</p>
                  </div>
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    {s.phone && <p className="flex items-start gap-1.5"><Phone className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span className="break-all">{s.phone}</span></p>}
                    {s.email && <p className="flex items-start gap-1.5"><Mail className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span className="break-all">{s.email}</span></p>}
                    {s.address && <p className="flex items-start gap-1.5"><MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span className="break-words whitespace-normal min-w-0">{s.address}</span></p>}
                    {!!s.locationCount && <p className="text-[10px]">{s.locationCount} saved location{s.locationCount === 1 ? '' : 's'}</p>}
                  </div>
                  <div className="mt-auto space-y-2">
                    <div className="rounded-md bg-primary/5 border border-primary/20 px-2 py-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Deposit Balance</p>
                      <p className="font-semibold text-primary break-words">{fmt(s.depositBalance)}</p>
                    </div>
                    {/* Same design as the Deposit Balance tab, in pink */}
                    <div className="rounded-md bg-pink-500/5 border border-pink-500/20 px-2 py-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Bills Pending{s.billCount ? ` (${s.billCount})` : ''}</p>
                      <p className="font-semibold text-pink-500 break-words">{fmt(s.billsPending)}</p>
                    </div>
                  </div>
                  <div className="border-t border-border pt-2">{renderActions(s)}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import Suppliers"
        template="suppliers"
        chunkSize={100}
        description={<>Upload a CSV with columns: <span className="font-medium text-foreground">Supplier Name, Phone, Email, Address</span>. Each row creates a new supplier. Press OK to start the import.</>}
        onImport={runImport}
        onDone={load}
      />

      {/* Add / edit supplier */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit Supplier' : 'New Supplier'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Supplier name" /></div>
            <div><Label>Phone</Label><Input value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="+254..." /></div>
            <div><Label>Email</Label><Input value={formEmail} onChange={e => setFormEmail(e.target.value)} /></div>
            <div><Label>Address</Label>
              <div className="flex gap-2">
                <Input value={formAddress} onChange={e => setFormAddress(e.target.value)} className="flex-1" />
                <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={() => setShowLocationPicker(true)}><MapPin className="w-4 h-4" /></Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LocationPickerDialog
        open={showLocationPicker}
        onOpenChange={setShowLocationPicker}
        title="Supplier Location"
        value={formAddress}
        onSelect={(address) => { setFormAddress(address); }}
      />

      {/* Supplier account: transactions, bills, locations */}
      <Dialog open={!!acct} onOpenChange={o => { if (!o) setAcct(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="break-words pr-6">{acct?.supplierName}</DialogTitle></DialogHeader>
          {acct && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Deposit Balance</p>
                  <p className="text-lg font-bold text-primary">{fmt(acct.depositBalance)}</p>
                </div>
                <div className="rounded-lg border border-pink-500/30 bg-pink-500/5 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Bills Pending</p>
                  <p className="text-lg font-bold text-pink-500">{fmt(acctPending)}</p>
                </div>
              </div>
              {can('suppliers', 'edit') && <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setDepositOpen(true)}><Plus className="w-4 h-4 mr-1" /> Add Deposit</Button>
                <Button size="sm" variant="outline" className="border-pink-500 text-pink-400 hover:bg-pink-500/10" onClick={() => setBillOpen(true)}><Receipt className="w-4 h-4 mr-1" /> Add Bill</Button>
                <Button size="sm" variant="outline" onClick={() => setLocOpen(true)}><MapPin className="w-4 h-4 mr-1" /> Add Location</Button>
              </div>}

              <Tabs value={acctTab} onValueChange={setAcctTab}>
                <TabsList className="bg-muted">
                  <TabsTrigger value="transactions">Transactions ({txs.length})</TabsTrigger>
                  <TabsTrigger value="bills">Bills ({bills.length})</TabsTrigger>
                  <TabsTrigger value="locations">Locations ({locs.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="transactions" className="mt-3 space-y-1.5">
                  {acctLoading && txs.length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
                    : txs.length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">No deposits or deductions yet</p>
                    : txs.map(t => (
                      <div key={t.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">{t.type}</p>
                          <p className="text-muted-foreground break-words">{dateTxt(t.transactionDate)}{t.notes ? ` · ${t.notes}` : ''}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`font-semibold ${t.type === 'Deposit' ? 'text-emerald-400' : 'text-pink-400'}`}>{t.type === 'Deposit' ? '+' : '-'}{fmt(t.amount)}</p>
                          <p className="text-muted-foreground">Bal {fmt(t.runningBalance)}</p>
                        </div>
                      </div>
                    ))}
                </TabsContent>

                <TabsContent value="bills" className="mt-3 space-y-1.5">
                  {acctLoading && bills.length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
                    : bills.length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">No bills yet. Add one, or select picked-up items on a POS route.</p>
                    : bills.map(b => (
                      <div key={b.id} className="rounded-md bg-muted/40 px-3 py-2 text-xs space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-foreground flex items-center gap-1.5 flex-wrap">
                              <FileText className="w-3 h-3" /> {dateTxt(b.date)}
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{b.source === 'pickup' ? 'POS pick-up' : 'Manual'}</Badge>
                              <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${b.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-pink-500/10 text-pink-400'}`}>
                                {b.status === 'paid' ? `Paid${b.paidFrom === 'deposit' ? ' (deposit)' : ''}` : 'Pending'}
                              </Badge>
                            </p>
                            {b.notes && <p className="text-muted-foreground break-words mt-0.5">{b.notes}</p>}
                            {b.items && b.items.length > 0 && (
                              <p className="text-muted-foreground break-words mt-0.5">{b.items.map(i => `${i.quantity}× ${i.name}`).join(', ')}</p>
                            )}
                          </div>
                          <p className="font-bold text-foreground shrink-0">{fmt(b.amount)}</p>
                        </div>
                        <div className="flex gap-1.5 justify-end">
                          {b.status === 'pending' && (
                            <>
                              <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" disabled={busy} onClick={() => handlePayBill(b, false)}>Mark paid</Button>
                              <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" disabled={busy || (acct.depositBalance || 0) < b.amount} onClick={() => handlePayBill(b, true)} title={(acct.depositBalance || 0) < b.amount ? 'Deposit balance is too low' : 'Pay from deposit'}>Pay from deposit</Button>
                            </>
                          )}
                          <AlertDialog>
                            <AlertDialogTrigger asChild><Button size="sm" variant="ghost" className="h-6 px-1.5 text-destructive"><Trash2 className="w-3 h-3" /></Button></AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader><AlertDialogTitle>Delete this bill?</AlertDialogTitle><AlertDialogDescription>This cannot be undone. A bill already paid from the deposit will not be refunded.</AlertDialogDescription></AlertDialogHeader>
                              <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteBill(b)} className="bg-destructive">Delete</AlertDialogAction></AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    ))}
                </TabsContent>

                <TabsContent value="locations" className="mt-3 space-y-1.5">
                  {acctLoading && locs.length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
                    : locs.length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">No locations yet. Locations added here also appear on the Addresses page.</p>
                    : locs.map(l => (
                      <div key={l.id} className="flex items-start gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs">
                        <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-foreground break-words">{l.addressName}</p>
                          {l.fullAddress && <p className="text-muted-foreground break-words">{l.fullAddress}</p>}
                        </div>
                        <Button size="sm" variant="ghost" className="h-6 px-1.5 text-destructive" onClick={() => handleDeleteLocation(l.id)}><Trash2 className="w-3 h-3" /></Button>
                      </div>
                    ))}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add deposit */}
      <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Deposit — {acct?.supplierName}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Amount (KES) *</Label><Input type="number" value={depAmount} onChange={e => setDepAmount(e.target.value)} placeholder="0.00" /></div>
            <div><Label>Notes</Label><Input value={depNotes} onChange={e => setDepNotes(e.target.value)} placeholder="Optional" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDepositOpen(false)}>Cancel</Button>
            <Button onClick={handleDeposit} disabled={busy}>{busy ? 'Saving...' : 'Record Deposit'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add bill */}
      <Dialog open={billOpen} onOpenChange={setBillOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Bill — {acct?.supplierName}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">An amount you owe this supplier, e.g. stock taken on credit.</p>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Amount (KES) *</Label><Input type="number" value={billAmount} onChange={e => setBillAmount(e.target.value)} placeholder="0.00" /></div>
              <div><Label>Date</Label><DatePicker value={billDate} onChange={setBillDate} /></div>
            </div>
            <div><Label>Description / notes</Label><Input value={billNotes} onChange={e => setBillNotes(e.target.value)} placeholder="e.g. 20 disposables on credit" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBillOpen(false)}>Cancel</Button>
            <Button onClick={handleAddBill} disabled={busy}>{busy ? 'Saving...' : 'Record Bill'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add supplier location (also shows on the Addresses page and in POS saved addresses) */}
      <Dialog open={locOpen} onOpenChange={setLocOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Location — {acct?.supplierName}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Location name *</Label><Input value={locName} onChange={e => setLocName(e.target.value)} placeholder="e.g. Godown, Industrial Area" /></div>
            <div><Label>Address</Label>
              <div className="flex gap-2">
                <Input value={locAddress} onChange={e => setLocAddress(e.target.value)} className="flex-1" />
                <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={() => setShowLocPicker2(true)}><MapPin className="w-4 h-4" /></Button>
              </div>
              {locCoords && <p className="text-[10px] font-mono text-muted-foreground mt-1">{locCoords}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLocOpen(false)}>Cancel</Button>
            <Button onClick={handleAddLocation} disabled={busy}>{busy ? 'Saving...' : 'Add Location'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LocationPickerDialog
        open={showLocPicker2}
        onOpenChange={setShowLocPicker2}
        title="Supplier Location"
        value={locAddress}
        onSelect={(address, coords) => { setLocAddress(address); setLocCoords(coords); }}
      />
    </div>
  );
}
