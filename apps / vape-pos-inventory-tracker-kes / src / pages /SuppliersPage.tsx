import { useState, useEffect } from 'react';
import { getSuppliers, saveSupplier, deleteRecord, exportCsv, importCsv, bulkDeleteRecords } from 'zitejs/api';
import { Card, CardContent } from '@project/components/ui/card';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@project/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@project/components/ui/alert-dialog';
import { Search, Plus, Download, Upload, Truck, Pencil, Trash2, MapPin, CheckSquare, Phone, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { downloadCsv } from '../lib/exportHelper';
import LocationPickerDialog from '../components/LocationPickerDialog';
import ViewToggle, { useViewMode } from '../components/ViewToggle';
import ImportDialog from '../components/ImportDialog';

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
  const [importOpen, setImportOpen] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useViewMode('suppliers', 'list');

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

  const fmt = (n?: number) => `KES ${(n || 0).toLocaleString()}`;

  const renderActions = (s: Supplier) => (
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
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Suppliers</h1>
          <p className="text-sm text-muted-foreground">{suppliers.length} suppliers</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ViewToggle value={viewMode} onChange={setViewMode} />
          {selectedIds.size > 0 && (
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
          <Button variant="outline" size="sm" className="border-pink-500 text-pink-400 hover:bg-pink-500/10" onClick={handleExport}><Download className="w-4 h-4 mr-1" /> Export</Button>
          <Button variant="outline" size="sm" className="border-green-500 text-green-400 hover:bg-green-500/10" onClick={() => setImportOpen(true)}><Upload className="w-4 h-4 mr-1" /> Import</Button>
          <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Add Supplier</Button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search suppliers..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {viewMode === 'list' ? (
        <Card className="bg-card border-border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="p-3 w-8"><input type="checkbox" checked={selectedIds.size === suppliers.length && suppliers.length > 0} onChange={toggleSelectAll} className="rounded" /></th>
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
                        <td className="p-3"></td>
                        {[...Array(5)].map((_, j) => <td key={j} className="p-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}
                      </tr>
                    ))
                  ) : suppliers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-muted-foreground">
                        <Truck className="w-10 h-10 mx-auto mb-2 opacity-40" />
                        No suppliers found
                      </td>
                    </tr>
                  ) : suppliers.map(s => (
                    <tr key={s.id} className="border-b border-border hover:bg-muted/30">
                      <td className="p-3"><input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelect(s.id)} className="rounded" /></td>
                      <td className="p-3 font-medium text-foreground break-words whitespace-normal">{s.supplierName}</td>
                      <td className="p-3 text-muted-foreground whitespace-nowrap">{s.phone || '-'}</td>
                      <td className="p-3 text-muted-foreground break-all">{s.email || '-'}</td>
                      <td className="p-3 text-right font-semibold text-primary whitespace-nowrap">{fmt(s.depositBalance)}</td>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {loading ? (
              [...Array(4)].map((_, i) => (
                <Card key={i} className="bg-card border-border"><CardContent className="p-4"><div className="h-24 bg-muted rounded animate-pulse" /></CardContent></Card>
              ))
            ) : suppliers.length === 0 ? (
              <Card className="col-span-full bg-card border-border">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Truck className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  No suppliers found
                </CardContent>
              </Card>
            ) : suppliers.map(s => (
              <Card key={s.id} className={`bg-card ${selectedIds.has(s.id) ? 'border-primary' : 'border-border'}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelect(s.id)} className="mt-1 rounded shrink-0" />
                    <p className="font-semibold text-foreground break-words whitespace-normal leading-snug min-w-0 flex-1">{s.supplierName}</p>
                  </div>
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    {s.phone && <p className="flex items-start gap-1.5"><Phone className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span className="break-all">{s.phone}</span></p>}
                    {s.email && <p className="flex items-start gap-1.5"><Mail className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span className="break-all">{s.email}</span></p>}
                    {s.address && <p className="flex items-start gap-1.5"><MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span className="break-words whitespace-normal min-w-0">{s.address}</span></p>}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Deposit Balance</p>
                    <p className="font-semibold text-primary break-words">{fmt(s.depositBalance)}</p>
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
