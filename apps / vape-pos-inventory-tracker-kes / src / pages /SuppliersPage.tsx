import { useState, useEffect, useRef } from 'react';
import { getSuppliers, saveSupplier, deleteRecord, exportCsv, importCsv, recordDeposit, getSupplierDetails } from 'zitejs/api';
import { Card, CardContent } from '@project/components/ui/card';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@project/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@project/components/ui/alert-dialog';
import { Search, Plus, Download, Upload, Truck, Pencil, Trash2, Eye, DollarSign, FileDown, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { downloadCsv, parseCsv, downloadTemplate } from '../lib/exportHelper';
import { format } from 'date-fns';
import LocationPickerDialog from '../components/LocationPickerDialog';

interface Supplier {
  id: string;
  supplierName?: string;
  phone?: string;
  email?: string;
  address?: string;
  depositBalance?: number;
}

export default function SuppliersPage() {
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
  const [showDeposit, setShowDeposit] = useState(false);
  const [depositSupplierId, setDepositSupplierId] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositNotes, setDepositNotes] = useState('');
  const [showTransactions, setShowTransactions] = useState(false);
  const [txSupplier, setTxSupplier] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);

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

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) return toast.error('No data found');
    try {
      const res = await importCsv({ table: 'suppliers', rows });
      toast.success(`Imported ${res.imported}`);
      load();
    } catch (err: any) { toast.error(err.message || 'Failed'); }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeposit = async () => {
    if (!depositAmount || Number(depositAmount) <= 0) return toast.error('Enter a valid amount');
    try {
      await recordDeposit({ supplierId: depositSupplierId, amount: Number(depositAmount), notes: depositNotes || undefined });
      toast.success('Deposit recorded');
      setShowDeposit(false); setDepositAmount(''); setDepositNotes('');
      load();
    } catch (e: any) { toast.error(e.message || 'Failed'); }
  };

  const openTransactions = async (s: Supplier) => {
    try {
      const res = await getSupplierDetails({ supplierId: s.id });
      setTxSupplier(res.supplier);
      setTransactions(res.transactions);
      setShowTransactions(true);
    } catch { toast.error('Failed to load'); }
  };

  const fmt = (n?: number) => `KES ${(n || 0).toLocaleString()}`;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Suppliers</h1>
          <p className="text-sm text-muted-foreground">{suppliers.length} suppliers</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="border-pink-500 text-pink-400 hover:bg-pink-500/10" onClick={handleExport}><Download className="w-4 h-4 mr-1" /> Export</Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="border-green-500 text-green-400 hover:bg-green-500/10"><Upload className="w-4 h-4 mr-1" /> Import</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>Import Suppliers</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Upload a CSV file with columns: <span className="font-medium text-foreground">Supplier Name, Phone, Email, Address</span>. Each row creates a new supplier.</p>
                <Button variant="outline" size="sm" className="border-yellow-500 text-yellow-400 hover:bg-yellow-500/10" onClick={() => downloadTemplate('suppliers')}><FileDown className="w-4 h-4 mr-1" /> Download Template</Button>
                <div>
                  <Label className="text-sm mb-1 block">Select CSV file</Label>
                  <Input ref={fileInputRef} type="file" accept=".csv,.txt" onChange={handleImport} />
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Add Supplier</Button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search suppliers..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left p-3 font-medium">Name</th>
                  <th className="text-left p-3 font-medium">Phone</th>
                  <th className="text-left p-3 font-medium">Email</th>
                  <th className="text-right p-3 font-medium">Deposit Balance</th>
                  <th className="text-right p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      {[...Array(5)].map((_, j) => <td key={j} className="p-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}
                    </tr>
                  ))
                ) : suppliers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-muted-foreground">
                      <Truck className="w-10 h-10 mx-auto mb-2 opacity-40" />
                      No suppliers found
                    </td>
                  </tr>
                ) : suppliers.map(s => (
                  <tr key={s.id} className="border-b border-border hover:bg-muted/30">
                    <td className="p-3 font-medium text-foreground">{s.supplierName}</td>
                    <td className="p-3 text-muted-foreground">{s.phone || '-'}</td>
                    <td className="p-3 text-muted-foreground">{s.email || '-'}</td>
                    <td className="p-3 text-right font-semibold text-primary">{fmt(s.depositBalance)}</td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(s)}><Pencil className="w-3.5 h-3.5" /></Button>
                        <AlertDialog>
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
                        </AlertDialog>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

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
    </div>
  );
}
