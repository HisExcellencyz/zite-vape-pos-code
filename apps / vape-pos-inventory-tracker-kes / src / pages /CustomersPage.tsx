import { useState, useEffect, useRef } from 'react';
import { getCustomers, saveCustomer, deleteRecord, exportCsv, importCsv, getCustomerDetails, bulkDeleteRecords } from 'zitejs/api';
import { Card, CardContent } from '@project/components/ui/card';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@project/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@project/components/ui/alert-dialog';
import { Search, Plus, Download, Upload, Users, Pencil, Trash2, Phone, Eye, FileDown, MapPin, CheckSquare, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { downloadCsv, parseCsv, downloadTemplate } from '../lib/exportHelper';
import { format } from 'date-fns';
import LocationPickerDialog from '../components/LocationPickerDialog';
import ViewToggle, { useViewMode } from '../components/ViewToggle';

interface Customer {
  id: string;
  customerName?: string;
  phoneNumber?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [detailCustomer, setDetailCustomer] = useState<any>(null);
  const [detailOrders, setDetailOrders] = useState<any[]>([]);
  const [detailStats, setDetailStats] = useState({ orderCount: 0, totalSpent: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useViewMode('customers', 'list');

  const load = async () => {
    setLoading(true);
    try {
      const res = await getCustomers({ search });
      setCustomers(res.customers as Customer[]);
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

  const openEdit = (c: Customer) => {
    setEditing(c);
    setFormName(c.customerName || '');
    setFormPhone(c.phoneNumber || '');
    setFormEmail(c.email || '');
    setFormAddress(c.address || '');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formName || !formPhone) return toast.error('Name and phone number are required');
    setSaving(true);
    try {
      await saveCustomer({
        id: editing?.id,
        customerName: formName,
        phoneNumber: formPhone,
        email: formEmail || undefined,
        address: formAddress || undefined,
      });
      toast.success(editing ? 'Customer updated' : 'Customer created');
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
      await deleteRecord({ table: 'customers', id });
      toast.success('Customer deleted');
      load();
    } catch { toast.error('Failed'); }
  };

  const handleExport = async () => {
    try {
      const res = await exportCsv({ table: 'customers' });
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
      const res = await importCsv({ table: 'customers', rows });
      toast.success(`Imported ${res.imported}, Updated ${res.updated}`);
      load();
    } catch (err: any) { toast.error(err.message || 'Failed'); }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openDetails = async (c: Customer) => {
    try {
      const res = await getCustomerDetails({ customerId: c.id });
      setDetailCustomer(res.customer);
      setDetailOrders(res.orders);
      setDetailStats({ orderCount: res.orderCount, totalSpent: res.totalSpent });
      setShowDetails(true);
    } catch { toast.error('Failed to load details'); }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    setSelectedIds(selectedIds.size === customers.length ? new Set() : new Set(customers.map(c => c.id)));
  };

  const handleBulkDelete = async () => {
    try {
      const res = await bulkDeleteRecords({ table: 'customers', ids: Array.from(selectedIds) });
      toast.success(`Deleted ${res.deleted} customers`);
      setSelectedIds(new Set());
      load();
    } catch { toast.error('Bulk delete failed'); }
  };

  const renderActions = (c: Customer) => (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" onClick={() => openDetails(c)}><Eye className="w-3.5 h-3.5" /></Button>
      <Button variant="ghost" size="sm" onClick={() => openEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button>
      <AlertDialog>
        <AlertDialogTrigger asChild><Button variant="ghost" size="sm" className="text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button></AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete customer?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete {c.customerName}.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleDelete(c.id)} className="bg-destructive">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Customers</h1>
          <p className="text-sm text-muted-foreground">{customers.length} customers</p>
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
                  <AlertDialogTitle>Delete {selectedIds.size} customers?</AlertDialogTitle>
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
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="border-green-500 text-green-400 hover:bg-green-500/10"><Upload className="w-4 h-4 mr-1" /> Import</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>Import Customers</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Upload a CSV file with columns: <span className="font-medium text-foreground">Customer Name, Phone Number, Email, Address</span>. Existing customers matched by phone number will be updated.</p>
                <Button variant="outline" size="sm" className="border-yellow-500 text-yellow-400 hover:bg-yellow-500/10" onClick={() => downloadTemplate('customers')}><FileDown className="w-4 h-4 mr-1" /> Download Template</Button>
                <div>
                  <Label className="text-sm mb-1 block">Select CSV file</Label>
                  <Input ref={fileInputRef} type="file" accept=".csv,.txt" onChange={handleImport} />
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Add Customer</Button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search by name or phone..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {viewMode === 'list' ? (
        <Card className="bg-card border-border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="p-3 w-8"><input type="checkbox" checked={selectedIds.size === customers.length && customers.length > 0} onChange={toggleSelectAll} className="rounded" /></th>
                    <th className="text-left p-3 font-medium">Name</th>
                    <th className="text-left p-3 font-medium">Phone</th>
                    <th className="text-left p-3 font-medium">Email</th>
                    <th className="text-left p-3 font-medium">Address</th>
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
                  ) : customers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-muted-foreground">
                        <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
                        No customers found
                      </td>
                    </tr>
                  ) : customers.map(c => (
                    <tr key={c.id} className="border-b border-border hover:bg-muted/30">
                      <td className="p-3"><input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} className="rounded" /></td>
                      <td className="p-3 font-medium text-foreground break-words whitespace-normal">{c.customerName}</td>
                      <td className="p-3 text-muted-foreground whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{c.phoneNumber}</span></td>
                      <td className="p-3 text-muted-foreground break-all">{c.email || '-'}</td>
                      <td className="p-3 text-muted-foreground break-words whitespace-normal max-w-xs">{c.address || '-'}</td>
                      <td className="p-3 text-right">{renderActions(c)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {customers.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground select-none w-fit cursor-pointer">
              <input type="checkbox" checked={selectedIds.size === customers.length} onChange={toggleSelectAll} className="rounded" />
              Select all
            </label>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {loading ? (
              [...Array(4)].map((_, i) => (
                <Card key={i} className="bg-card border-border"><CardContent className="p-4"><div className="h-24 bg-muted rounded animate-pulse" /></CardContent></Card>
              ))
            ) : customers.length === 0 ? (
              <Card className="col-span-full bg-card border-border">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  No customers found
                </CardContent>
              </Card>
            ) : customers.map(c => (
              <Card key={c.id} className={`bg-card ${selectedIds.has(c.id) ? 'border-primary' : 'border-border'}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} className="mt-1 rounded shrink-0" />
                    <p className="font-semibold text-foreground break-words whitespace-normal leading-snug min-w-0 flex-1">{c.customerName}</p>
                  </div>
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    <p className="flex items-start gap-1.5"><Phone className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span className="break-all">{c.phoneNumber}</span></p>
                    {c.email && <p className="flex items-start gap-1.5"><Mail className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span className="break-all">{c.email}</span></p>}
                    {c.address && <p className="flex items-start gap-1.5"><MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span className="break-words whitespace-normal min-w-0">{c.address}</span></p>}
                  </div>
                  <div className="border-t border-border pt-2">{renderActions(c)}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit Customer' : 'New Customer'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Customer name" /></div>
            <div><Label>Phone Number * (with +)</Label><Input value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="+254712345678" /></div>
            <div><Label>Email</Label><Input value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="email@example.com" /></div>
            <div><Label>Address</Label>
              <div className="flex gap-2">
                <Input value={formAddress} onChange={e => setFormAddress(e.target.value)} placeholder="Address" className="flex-1" />
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
        title="Customer Location"
        value={formAddress}
        onSelect={(address) => { setFormAddress(address); }}
      />

      {/* Customer Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="break-words">{detailCustomer?.customerName}</DialogTitle></DialogHeader>
          {detailCustomer && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {detailCustomer.phoneNumber}</span>
                {detailCustomer.email && <span className="break-all">{detailCustomer.email}</span>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Card className="bg-muted/50 border-border">
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Total Orders</p>
                    <p className="text-2xl font-bold text-foreground">{detailStats.orderCount}</p>
                  </CardContent>
                </Card>
                <Card className="bg-muted/50 border-border">
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Total Spent</p>
                    <p className="text-2xl font-bold text-primary">KES {detailStats.totalSpent.toLocaleString()}</p>
                  </CardContent>
                </Card>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Order History</h3>
                {detailOrders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No orders yet</p>
                ) : (
                  <div className="space-y-2">
                    {detailOrders.map((o: any) => (
                      <div key={o.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <div>
                          <p className="text-sm text-foreground">{o.saleDate ? format(new Date(o.saleDate), 'dd MMM yyyy') : '-'}</p>
                          <p className="text-xs text-muted-foreground">{o.paymentMethod} · {o.status}</p>
                        </div>
                        <p className="text-sm font-semibold text-foreground">KES {o.total.toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
