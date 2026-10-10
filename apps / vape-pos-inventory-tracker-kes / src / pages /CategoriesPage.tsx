import { useState, useEffect } from 'react';
import { getCategories, saveCategory, deleteRecord, bulkUpdateCategories, bulkDeleteRecords } from 'zitejs/api';
import { Card, CardContent } from '@project/components/ui/card';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Badge } from '@project/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@project/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@project/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Switch } from '@project/components/ui/switch';
import { Textarea } from '@project/components/ui/textarea';
import { Search, Plus, Pencil, Trash2, FolderTree, CheckSquare, FolderOpen, CornerDownRight } from 'lucide-react';
import { toast } from 'sonner';
import ViewToggle, { useViewMode } from '../components/ViewToggle';
import { buildCategoryTree } from '../components/CategoryRibbon';
import { usePermissions } from '../hooks/usePermissions';

interface Category {
  id: string;
  categoryName?: string;
  description?: string;
  active?: boolean;
  /** Set for sub-categories: the id of the category they sit under. */
  parentId?: string | null;
}

const NO_PARENT = '__none__';

export default function CategoriesPage() {
  const { can } = usePermissions();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [viewMode, setViewMode] = useViewMode('categories', 'grid');

  // Subcategories dialog (opened from a category's "Subcategories" button)
  const [subsForId, setSubsForId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const [parentId, setParentId] = useState<string>(NO_PARENT);

  // Bulk create
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');

  // Bulk selection / actions (main categories only)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkCat, setShowBulkCat] = useState(false);
  const [bulkCatAction, setBulkCatAction] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await getCategories({});
      setCategories(res.categories as Category[]);
    } catch { toast.error('Failed to load categories'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const tree = buildCategoryTree(categories);
  const kidsOf = (id: string) => tree.kids.get(id) || [];
  const kidCount = (id: string) => kidsOf(id).length;
  const subsFor = subsForId ? tree.byId.get(subsForId) : undefined;

  const openNew = (underId?: string) => {
    setEditing(null);
    setName('');
    setDescription('');
    setActive(true);
    setParentId(underId || NO_PARENT);
    setDialogOpen(true);
  };

  const openEdit = (c: Category) => {
    setEditing(c);
    setName(c.categoryName || '');
    setDescription(c.description || '');
    setActive(c.active !== false);
    setParentId(c.parentId && tree.byId.has(c.parentId) ? c.parentId : NO_PARENT);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Name required'); return; }
    try {
      await saveCategory({
        id: editing?.id,
        categoryName: name.trim(),
        description: description.trim() || undefined,
        active,
        parentId: parentId === NO_PARENT ? null : parentId,
      });
      toast.success(editing ? 'Category updated' : parentId !== NO_PARENT ? 'Subcategory created' : 'Category created');
      setDialogOpen(false);
      load();
    } catch (err: any) { toast.error(err.message || 'Save failed'); }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRecord({ table: 'categories', id });
      toast.success('Deleted');
      load();
    } catch { toast.error('Delete failed'); }
  };

  /**
   * One category per line. Write "Parent > Subcategory" for a subcategory, e.g.
   *   E-Liquids
   *   E-Liquids > Salt Nic
   * Names that already exist (under the same parent) are skipped.
   */
  const handleBulkCreate = async () => {
    const lines = bulkText.split('\n').map(n => n.trim()).filter(Boolean);
    if (!lines.length) { toast.error('Enter at least one category name'); return; }
    const norm = (s: string) => s.trim().toLowerCase();
    const topIds = new Map<string, string>(); // lower-case name -> id of a top-level category
    tree.tops.forEach(t => topIds.set(norm(t.categoryName || ''), t.id));
    const subKeys = new Set<string>(); // "parentId|name" of existing subcategories
    tree.kids.forEach((list, pid) => list.forEach(k => subKeys.add(`${pid}|${norm(k.categoryName || '')}`)));

    let created = 0, skipped = 0, failed = 0;
    const ensureTop = async (n: string): Promise<string | null> => {
      const hit = topIds.get(norm(n));
      if (hit) return hit;
      try {
        const res = await saveCategory({ categoryName: n, active: true });
        topIds.set(norm(n), res.category.id);
        created++;
        return res.category.id as string;
      } catch { failed++; return null; }
    };

    // Top-level names first (explicit lines and the parents named in "Parent > Child" lines), so order in the box does not matter.
    for (const line of lines) {
      const parts = line.split('>').map(p => p.trim()).filter(Boolean);
      if (parts.length === 1) {
        if (topIds.has(norm(parts[0]))) skipped++; else await ensureTop(parts[0]);
      }
    }
    for (const line of lines) {
      const parts = line.split('>').map(p => p.trim()).filter(Boolean);
      if (parts.length < 2) continue;
      const pid = await ensureTop(parts[0]);
      if (!pid) continue;
      const sub = parts.slice(1).join(' > ');
      const key = `${pid}|${norm(sub)}`;
      if (subKeys.has(key)) { skipped++; continue; }
      try {
        await saveCategory({ categoryName: sub, active: true, parentId: pid });
        subKeys.add(key);
        created++;
      } catch { failed++; }
    }

    toast.success(`Created ${created} categories${skipped ? `, ${skipped} already existed` : ''}${failed ? `, ${failed} failed` : ''}`);
    setBulkOpen(false);
    setBulkText('');
    load();
  };

  // Only main categories are listed here. Subcategories live behind each category's "Subcategories" button.
  // A search keeps a main category when its own name matches or when one of its subcategories matches.
  const q = search.trim().toLowerCase();
  const filtered: Category[] = tree.tops.filter(t =>
    !q
    || (t.categoryName || '').toLowerCase().includes(q)
    || kidsOf(t.id).some(k => (k.categoryName || '').toLowerCase().includes(q)),
  );
  const subMatchOnly = (t: Category) =>
    !!q && !(t.categoryName || '').toLowerCase().includes(q)
    && kidsOf(t.id).some(k => (k.categoryName || '').toLowerCase().includes(q));

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(c => c.id)));
    }
  };

  const handleBulkCatAction = async () => {
    if (selectedIds.size === 0) return toast.error('Select categories first');
    if (!bulkCatAction) return toast.error('Select an action');
    try {
      if (bulkCatAction === 'delete') {
        const res = await bulkDeleteRecords({ table: 'categories', ids: Array.from(selectedIds) });
        toast.success(`Deleted ${res.deleted} categories`);
      } else {
        await bulkUpdateCategories({ categoryIds: Array.from(selectedIds), action: bulkCatAction as 'activate' | 'deactivate' });
        toast.success(`Updated ${selectedIds.size} categories`);
      }
      setSelectedIds(new Set());
      setShowBulkCat(false);
      setBulkCatAction('');
      load();
    } catch (err: any) { toast.error(err.message || 'Failed'); }
  };

  const deleteButton = (c: Category, isSub: boolean) => (
    <AlertDialog>
      <AlertDialogTrigger asChild><Button variant="ghost" size="sm" className="text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {isSub ? 'subcategory' : 'category'}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove "{c.categoryName}" permanently.
            {!isSub && kidCount(c.id) > 0 && <> Its {kidCount(c.id)} subcategor{kidCount(c.id) === 1 ? 'y' : 'ies'} will be kept and shown as main categories.</>}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(c.id)}>Delete</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  /** Buttons on every main category tile / row: add a subcategory, view subcategories, edit, delete. */
  const renderActions = (c: Category) => (
    <div className="flex items-center gap-1 flex-wrap">
      {can('categories', 'create') && (
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs border-amber-400/70 hover:border-amber-400" title="Create a subcategory under this category" onClick={() => openNew(c.id)}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Subcategory
        </Button>
      )}
      <Button variant="outline" size="sm" className="h-7 px-2 text-xs border-sky-500/70 hover:border-sky-500" title="View the subcategories of this category" onClick={() => setSubsForId(c.id)}>
        <FolderOpen className="w-3.5 h-3.5 mr-1" /> Subs ({kidCount(c.id)})
      </Button>
      <div className="flex items-center ml-auto">
        {can('categories', 'edit') && <Button variant="ghost" size="sm" onClick={() => openEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button>}
        {can('categories', 'delete') && deleteButton(c, false)}
      </div>
    </div>
  );

  const editingHasKids = !!editing && kidCount(editing.id) > 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Categories</h1>
          <p className="text-sm text-muted-foreground">{tree.tops.length} categories · subcategories are opened from each category's Subs button</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ViewToggle value={viewMode} onChange={setViewMode} />
          {selectedIds.size > 0 && can('categories', 'edit') && (
            <Button variant="outline" size="sm" onClick={() => setShowBulkCat(true)}>
              <CheckSquare className="w-4 h-4 mr-1" /> Bulk Actions ({selectedIds.size})
            </Button>
          )}
          {can('categories', 'create') && <>
            <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
              <FolderTree className="w-4 h-4 mr-1" /> Bulk Create
            </Button>
            <Button size="sm" onClick={() => openNew()}>
              <Plus className="w-4 h-4 mr-1" /> Add Category
            </Button>
          </>}
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search categories and subcategories..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {filtered.length > 0 && viewMode === 'grid' && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground select-none w-fit cursor-pointer">
          <input type="checkbox" checked={selectedIds.size === filtered.length} onChange={toggleSelectAll} className="rounded" />
          Select all
        </label>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No categories found</CardContent></Card>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(c => (
            <Card key={c.id} className={`hover:border-primary/30 transition-colors ${selectedIds.has(c.id) ? 'border-primary' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 flex items-start gap-2">
                    <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} className="mt-1 rounded shrink-0" />
                    <div className="min-w-0">
                      <h3 className="font-semibold text-foreground break-words whitespace-normal leading-snug">{c.categoryName}</h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{kidCount(c.id)} subcategor{kidCount(c.id) === 1 ? 'y' : 'ies'}</p>
                      {subMatchOnly(c) && <p className="text-[11px] text-sky-400 mt-0.5">Matches a subcategory</p>}
                      {c.description && <p className="text-xs text-muted-foreground mt-1 break-words whitespace-normal">{c.description}</p>}
                    </div>
                  </div>
                  <Badge variant={c.active !== false ? 'default' : 'secondary'} className="shrink-0">
                    {c.active !== false ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <div className="mt-3 pt-3 border-t border-border">{renderActions(c)}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="bg-card border-border">
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[65vh]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-border text-muted-foreground bg-card">
                    <th className="p-3 w-8"><input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} className="rounded" /></th>
                    <th className="text-left p-3 font-medium">Name</th>
                    <th className="text-left p-3 font-medium">Description</th>
                    <th className="text-center p-3 font-medium">Subcategories</th>
                    <th className="text-center p-3 font-medium">Status</th>
                    <th className="text-right p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => (
                    <tr key={c.id} className="border-b border-border hover:bg-muted/30">
                      <td className="p-3"><input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} className="rounded" /></td>
                      <td className="p-3 font-medium text-foreground break-words whitespace-normal">
                        {c.categoryName}
                        {subMatchOnly(c) && <span className="ml-2 text-[11px] font-normal text-sky-400">matches a subcategory</span>}
                      </td>
                      <td className="p-3 text-muted-foreground break-words whitespace-normal max-w-md">{c.description || '-'}</td>
                      <td className="p-3 text-center text-muted-foreground">{kidCount(c.id)}</td>
                      <td className="p-3 text-center">
                        <Badge variant={c.active !== false ? 'default' : 'secondary'}>{c.active !== false ? 'Active' : 'Inactive'}</Badge>
                      </td>
                      <td className="p-3"><div className="flex justify-end">{renderActions(c)}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Subcategories of one category */}
      <Dialog open={!!subsFor} onOpenChange={o => { if (!o) setSubsForId(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 break-words pr-6"><FolderOpen className="w-5 h-5 text-sky-400 shrink-0" /> Subcategories of {subsFor?.categoryName}</DialogTitle>
          </DialogHeader>
          {subsFor && (
            <div className="space-y-2">
              {kidsOf(subsFor.id).length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No subcategories yet.</p>
              ) : kidsOf(subsFor.id).map(k => (
                <div key={k.id} className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <CornerDownRight className="w-3.5 h-3.5 mt-1 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground break-words whitespace-normal">{k.categoryName}</p>
                    {k.description && <p className="text-xs text-muted-foreground break-words whitespace-normal">{k.description}</p>}
                  </div>
                  <Badge variant={k.active !== false ? 'default' : 'secondary'} className="shrink-0">{k.active !== false ? 'Active' : 'Inactive'}</Badge>
                  <div className="flex shrink-0">
                    {can('categories', 'edit') && <Button variant="ghost" size="sm" onClick={() => openEdit(k)}><Pencil className="w-3.5 h-3.5" /></Button>}
                    {can('categories', 'delete') && deleteButton(k, true)}
                  </div>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubsForId(null)}>Close</Button>
            {subsFor && can('categories', 'create') && (
              <Button onClick={() => openNew(subsFor.id)}><Plus className="w-4 h-4 mr-1" /> Add Subcategory</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? (editing.parentId ? 'Edit Subcategory' : 'Edit Category') : parentId !== NO_PARENT ? 'Add Subcategory' : 'Add Category'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder={parentId !== NO_PARENT ? 'e.g. Salt Nic' : 'e.g. E-Liquids'} /></div>
            <div>
              <Label>Parent category</Label>
              <Select value={parentId} onValueChange={setParentId} disabled={editingHasKids}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PARENT}>None (main category)</SelectItem>
                  {tree.tops.filter(t => t.id !== editing?.id).map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.categoryName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                {editingHasKids
                  ? 'This category has subcategories, so it stays a main category. Move or delete its subcategories first.'
                  : 'Pick a parent to make this a subcategory. Only two levels are allowed.'}
              </p>
            </div>
            <div><Label>Description</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description..." rows={3} /></div>
            <div className="flex items-center gap-3">
              <Switch checked={active} onCheckedChange={setActive} />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editing ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Create Dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Bulk Create Categories</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter one category per line. For a subcategory write <span className="font-medium text-foreground">Category &gt; Subcategory</span>.
              The main category is created automatically if it does not exist, and names that already exist are skipped.
            </p>
            <Textarea value={bulkText} onChange={e => setBulkText(e.target.value)} placeholder={"E-Liquids\nE-Liquids > Salt Nic\nE-Liquids > Freebase\nDisposables\nAccessories > Coils"} rows={8} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkCreate}>Create All</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Category Actions Dialog */}
      <Dialog open={showBulkCat} onOpenChange={setShowBulkCat}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Bulk Actions ({selectedIds.size} categories)</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Select value={bulkCatAction} onValueChange={setBulkCatAction}>
              <SelectTrigger><SelectValue placeholder="Select action" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="activate">Set Active</SelectItem>
                <SelectItem value="deactivate">Set Inactive</SelectItem>
                <SelectItem value="delete">Delete Selected</SelectItem>
              </SelectContent>
            </Select>
            {bulkCatAction === 'delete' && (
              <p className="text-xs text-destructive">⚠ This will permanently delete {selectedIds.size} categor{selectedIds.size === 1 ? 'y' : 'ies'}.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkCat(false)}>Cancel</Button>
            {bulkCatAction === 'delete' ? (
              <AlertDialog>
                <AlertDialogTrigger asChild><Button variant="destructive">Delete</Button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {selectedIds.size} categories?</AlertDialogTitle>
                    <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleBulkCatAction} className="bg-destructive">Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <Button onClick={handleBulkCatAction}>Apply</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
