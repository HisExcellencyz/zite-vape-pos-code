import { useState, useEffect } from 'react';
import { getUsers, saveRole, inviteUser, assignRole, revokeInvite, deleteRecord } from 'zitejs/api';
import { Card, CardContent } from '@project/components/ui/card';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Badge } from '@project/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@project/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@project/components/ui/tabs';
import { Switch } from '@project/components/ui/switch';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@project/components/ui/alert-dialog';
import { Search, Plus, UserPlus, Shield, Mail, Pencil, Trash2, Download, Check, X, Send } from 'lucide-react';
import { toast } from 'sonner';
import { downloadCsv } from '../lib/exportHelper';
import ViewToggle, { useViewMode } from '../components/ViewToggle';

const AREAS = ['pos', 'customers', 'inventory', 'purchases', 'suppliers', 'expenses', 'reports', 'users', 'settings'] as const;
const ACTIONS = ['view', 'create', 'edit', 'delete', 'export', 'import', 'approve', 'backdate'] as const;
type Area = typeof AREAS[number];
type Action = typeof ACTIONS[number];
type PermMatrix = Record<Area, Record<Action, boolean>>;

function emptyPerms(): PermMatrix {
  const p: any = {};
  AREAS.forEach(a => { p[a] = {}; ACTIONS.forEach(ac => { p[a][ac] = false; }); });
  return p;
}

interface AppUser {
  id: string;
  name?: string;
  email: string;
  firstName?: string;
  lastName?: string;
  emailVerified?: boolean;
  isOwner?: boolean;
  roleId?: string | null;
  roleName?: string;
  status?: string;
  invitedBy?: string;
  invitedAt?: string;
}
interface Role {
  id: string;
  roleName?: string;
  description?: string;
  permissions?: string;
  isDefault?: boolean;
  active?: boolean;
}

function countPerms(json?: string): number {
  if (!json) return 0;
  try {
    const p = JSON.parse(json);
    let n = 0;
    Object.values(p || {}).forEach((area: any) => {
      Object.values(area || {}).forEach(v => { if (v === true) n++; });
    });
    return n;
  } catch { return 0; }
}

export default function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useViewMode('users', 'list');

  const [inviteOpen, setInviteOpen] = useState(false);
  const [invEmail, setInvEmail] = useState('');
  const [invFirst, setInvFirst] = useState('');
  const [invLast, setInvLast] = useState('');
  const [invRole, setInvRole] = useState('');
  const [inviting, setInviting] = useState(false);

  const [roleOpen, setRoleOpen] = useState(false);
  const [editRole, setEditRole] = useState<Role | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleDesc, setRoleDesc] = useState('');
  const [rolePerms, setRolePerms] = useState<PermMatrix>(emptyPerms());
  const [roleDefault, setRoleDefault] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getUsers({});
      setUsers(res.users);
      setRoles(res.roles);
    } catch (e: any) { toast.error(e.message || 'Failed to load users'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleInvite = async () => {
    if (!invEmail.trim()) { toast.error('Email required'); return; }
    setInviting(true);
    try {
      const res = await inviteUser({
        email: invEmail.trim(),
        firstName: invFirst.trim() || undefined,
        lastName: invLast.trim() || undefined,
        roleId: invRole || undefined,
      });
      toast.success(res.message);
      setInviteOpen(false);
      setInvEmail(''); setInvFirst(''); setInvLast(''); setInvRole('');
      load();
    } catch (err: any) { toast.error(err.message || 'Invite failed'); }
    setInviting(false);
  };

  const handleResend = async (u: AppUser) => {
    try {
      const res = await inviteUser({
        email: u.email,
        firstName: u.firstName || undefined,
        lastName: u.lastName || undefined,
        roleId: u.roleId || undefined,
      });
      toast.success(res.message);
    } catch (err: any) { toast.error(err.message || 'Failed to resend'); }
  };

  const handleRevoke = async (u: AppUser) => {
    try {
      await revokeInvite({ email: u.email });
      toast.success('Invitation cancelled');
      load();
    } catch (err: any) { toast.error(err.message || 'Failed'); }
  };

  const handleAssignRole = async (userId: string, roleId: string) => {
    try {
      await assignRole({ userId, roleId });
      toast.success(roleId === 'none' ? 'Access removed' : 'Role assigned');
      load();
    } catch (err: any) { toast.error(err.message || 'Failed to assign role'); }
  };

  const openNewRole = () => {
    setEditRole(null); setRoleName(''); setRoleDesc('');
    setRolePerms(emptyPerms()); setRoleDefault(false); setRoleOpen(true);
  };

  const openEditRole = (r: Role) => {
    setEditRole(r);
    setRoleName(r.roleName || '');
    setRoleDesc(r.description || '');
    setRoleDefault(r.isDefault || false);
    try { setRolePerms(r.permissions ? JSON.parse(r.permissions) : emptyPerms()); } catch { setRolePerms(emptyPerms()); }
    setRoleOpen(true);
  };

  const togglePerm = (area: Area, action: Action) => {
    setRolePerms(prev => ({ ...prev, [area]: { ...prev[area], [action]: !prev[area]?.[action] } }));
  };

  const handleSaveRole = async () => {
    if (!roleName.trim()) { toast.error('Role name required'); return; }
    try {
      await saveRole({
        id: editRole?.id,
        roleName: roleName.trim(),
        description: roleDesc.trim() || undefined,
        permissions: JSON.stringify(rolePerms),
        isDefault: roleDefault,
        active: true,
      });
      toast.success(editRole ? 'Role updated' : 'Role created');
      setRoleOpen(false);
      load();
    } catch (err: any) { toast.error(err.message || 'Save failed'); }
  };

  const handleDeleteRole = async (id: string) => {
    try {
      await deleteRecord({ table: 'roles', id });
      toast.success('Role deleted');
      load();
    } catch { toast.error('Delete failed'); }
  };

  const handleExportUsers = () => {
    const csv = ['Name,Email,Role,Status'].concat(
      users.map(u => `"${u.name || ''}","${u.email}","${u.roleName || ''}","${u.status || ''}"`)
    ).join('\n');
    downloadCsv(csv, 'users_export.csv');
    toast.success('Exported');
  };

  const filtered = users.filter(u =>
    !search || u.email?.toLowerCase().includes(search.toLowerCase()) || u.name?.toLowerCase().includes(search.toLowerCase())
  );

  const statusBadge = (u: AppUser) => {
    const cls =
      u.status === 'Verified' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
      : u.status === 'Invited' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
      : 'bg-pink-500/10 text-pink-400 border-pink-500/20';
    return <Badge variant="secondary" className={`text-xs ${cls}`}>{u.status || 'Unverified'}</Badge>;
  };

  const roleControl = (u: AppUser, className: string) => {
    if (u.isOwner) return <Badge variant="outline" className="text-xs">Owner</Badge>;
    return (
      <Select value={u.roleId || 'none'} onValueChange={val => handleAssignRole(u.id, val)}>
        <SelectTrigger className={className}><SelectValue placeholder="Assign role" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No access</SelectItem>
          {roles.map(r => <SelectItem key={r.id} value={r.id}>{r.roleName}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  };

  const userActions = (u: AppUser) => {
    if (u.status !== 'Invited') return <span className="text-xs text-muted-foreground">—</span>;
    return (
      <div className="flex gap-1">
        <Button variant="ghost" size="sm" title="Resend invitation" onClick={() => handleResend(u)}><Send className="w-3.5 h-3.5" /></Button>
        <Button variant="ghost" size="sm" title="Cancel invitation" className="text-destructive" onClick={() => handleRevoke(u)}><X className="w-3.5 h-3.5" /></Button>
      </div>
    );
  };

  const roleActions = (r: Role) => (
    <div className="flex gap-1">
      <Button variant="ghost" size="sm" onClick={() => openEditRole(r)}><Pencil className="w-3.5 h-3.5" /></Button>
      <AlertDialog>
        <AlertDialogTrigger asChild><Button variant="ghost" size="sm" className="text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button></AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete role?</AlertDialogTitle><AlertDialogDescription>This will remove "{r.roleName}". Users with this role will lose access until reassigned.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteRole(r.id)}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Users & Roles</h1>
          <p className="text-sm text-muted-foreground">Invite team members, assign roles and control access</p>
        </div>
        <ViewToggle value={viewMode} onChange={setViewMode} />
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="roles">Roles & Permissions</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" size="sm" className="border-pink-500 text-pink-400 hover:bg-pink-500/10" onClick={handleExportUsers}>
                <Download className="w-4 h-4 mr-1" /> Export
              </Button>
              <Button size="sm" onClick={() => setInviteOpen(true)}>
                <UserPlus className="w-4 h-4 mr-1" /> Invite User
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No users found</CardContent></Card>
          ) : viewMode === 'list' ? (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border text-left text-muted-foreground">
                      <th className="p-3 font-medium">User</th>
                      <th className="p-3 font-medium">Email</th>
                      <th className="p-3 font-medium">Status</th>
                      <th className="p-3 font-medium">Role</th>
                      <th className="p-3 font-medium w-[110px]">Invite</th>
                    </tr></thead>
                    <tbody>
                      {filtered.map(u => (
                        <tr key={u.id} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="p-3 font-medium text-foreground break-words whitespace-normal">{u.name || u.firstName || '—'}</td>
                          <td className="p-3 text-muted-foreground break-all">{u.email}</td>
                          <td className="p-3">{statusBadge(u)}</td>
                          <td className="p-3">{roleControl(u, 'w-[150px] h-8 text-xs')}</td>
                          <td className="p-3">{userActions(u)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {filtered.map(u => (
                <Card key={u.id} className="bg-card border-border">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground break-words whitespace-normal leading-snug">{u.name || u.firstName || '—'}</p>
                        <p className="text-xs text-muted-foreground break-all mt-0.5">{u.email}</p>
                      </div>
                      <div className="shrink-0">{statusBadge(u)}</div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Role</p>
                      {roleControl(u, 'w-full h-8 text-xs')}
                    </div>
                    {u.status === 'Invited' && <div className="border-t border-border pt-2 flex justify-end">{userActions(u)}</div>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="roles" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Define roles and their permission matrices</p>
            <Button size="sm" onClick={openNewRole}><Plus className="w-4 h-4 mr-1" /> Add Role</Button>
          </div>

          {roles.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No roles defined yet. Create one to start assigning permissions.</CardContent></Card>
          ) : viewMode === 'grid' ? (
            <div className="space-y-4">
              {roles.map(r => {
                let perms: PermMatrix | null = null;
                try { perms = r.permissions ? JSON.parse(r.permissions) : null; } catch {}
                return (
                  <Card key={r.id}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <Shield className="w-5 h-5 text-primary shrink-0" />
                          <div className="min-w-0">
                            <h3 className="font-semibold text-foreground break-words whitespace-normal">{r.roleName}</h3>
                            {r.description && <p className="text-xs text-muted-foreground break-words whitespace-normal">{r.description}</p>}
                          </div>
                          {r.isDefault && <Badge variant="outline" className="text-xs shrink-0">Default</Badge>}
                        </div>
                        {roleActions(r)}
                      </div>
                      {perms && <PermissionsGrid perms={perms} />}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border text-left text-muted-foreground">
                      <th className="p-3 font-medium">Role</th>
                      <th className="p-3 font-medium">Description</th>
                      <th className="p-3 font-medium">Default</th>
                      <th className="p-3 font-medium">Permissions granted</th>
                      <th className="p-3 font-medium text-right">Actions</th>
                    </tr></thead>
                    <tbody>
                      {roles.map(r => (
                        <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="p-3 font-medium text-foreground break-words whitespace-normal">
                            <span className="inline-flex items-center gap-2"><Shield className="w-4 h-4 text-primary shrink-0" />{r.roleName}</span>
                          </td>
                          <td className="p-3 text-muted-foreground break-words whitespace-normal max-w-md">{r.description || '-'}</td>
                          <td className="p-3">{r.isDefault ? <Badge variant="outline" className="text-xs">Default</Badge> : '-'}</td>
                          <td className="p-3 text-muted-foreground">{countPerms(r.permissions)} of {AREAS.length * ACTIONS.length}</td>
                          <td className="p-3"><div className="flex justify-end">{roleActions(r)}</div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Invite User</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Email *</Label><Input value={invEmail} onChange={e => setInvEmail(e.target.value)} placeholder="user@example.com" type="email" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>First Name</Label><Input value={invFirst} onChange={e => setInvFirst(e.target.value)} /></div>
              <div><Label>Last Name</Label><Input value={invLast} onChange={e => setInvLast(e.target.value)} /></div>
            </div>
            <div>
              <Label>Role</Label>
              <Select value={invRole} onValueChange={setInvRole}>
                <SelectTrigger><SelectValue placeholder="Select a role (default role if empty)" /></SelectTrigger>
                <SelectContent>{roles.map(r => <SelectItem key={r.id} value={r.id}>{r.roleName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              An email is sent with a sign-in link. The person signs in with this email address (magic link or Google) and gets the role automatically. Until then they show as "Invited".
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={handleInvite} disabled={inviting}><Mail className="w-4 h-4 mr-1" />{inviting ? 'Sending...' : 'Send Invite'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Role Editor Dialog */}
      <Dialog open={roleOpen} onOpenChange={setRoleOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editRole ? 'Edit Role' : 'Create Role'}</DialogTitle></DialogHeader>
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Role Name *</Label><Input value={roleName} onChange={e => setRoleName(e.target.value)} placeholder="e.g. Cashier" /></div>
              <div><Label>Description</Label><Input value={roleDesc} onChange={e => setRoleDesc(e.target.value)} placeholder="Brief description" /></div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={roleDefault} onCheckedChange={setRoleDefault} />
              <Label className="text-sm">Use as the default role when inviting users without picking one</Label>
            </div>
            <div>
              <Label className="mb-2 block">Permissions Matrix</Label>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground">
                      <th className="p-2 text-left font-medium">Area</th>
                      {ACTIONS.map(a => <th key={a} className="p-2 text-center font-medium capitalize">{a}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {AREAS.map(area => (
                      <tr key={area} className="border-t border-border/50 hover:bg-muted/20">
                        <td className="p-2 font-medium text-foreground capitalize">{area}</td>
                        {ACTIONS.map(action => (
                          <td key={action} className="p-2 text-center">
                            <button
                              onClick={() => togglePerm(area, action)}
                              className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
                                rolePerms[area]?.[action] ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                              }`}
                            >
                              {rolePerms[area]?.[action] ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                            </button>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground mt-2">"view" controls whether the menu item and page are visible. Tip: for an admin role, tick users → edit.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveRole}>{editRole ? 'Update Role' : 'Create Role'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PermissionsGrid({ perms }: { perms: PermMatrix }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/50 text-muted-foreground">
            <th className="p-1.5 text-left font-medium">Area</th>
            {ACTIONS.map(a => <th key={a} className="p-1.5 text-center font-medium capitalize">{a}</th>)}
          </tr>
        </thead>
        <tbody>
          {AREAS.map(area => (
            <tr key={area} className="border-t border-border/50">
              <td className="p-1.5 font-medium text-foreground capitalize">{area}</td>
              {ACTIONS.map(action => (
                <td key={action} className="p-1.5 text-center">
                  {perms[area]?.[action] ? <Check className="w-3.5 h-3.5 text-green-400 mx-auto" /> : <span className="text-muted-foreground/40">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
