// Shared by the server endpoints and the Users & Roles page.
// One place that lists every permission area and which actions apply to it.

export type PermMatrix = Record<string, Record<string, boolean>>;

export const ACTION_LABELS: Record<string, string> = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  export: 'Export',
  import: 'Import',
  approve: 'Approve',
  assign: 'Assign',
  hold: 'Hold',
  route: 'Route',
  pay: 'Pay',
  archive: 'Archive',
  backdate: 'Backdate',
};

export const ACTION_HINTS: Record<string, string> = {
  view: 'See the menu item and page',
  create: 'Add new records',
  edit: 'Change existing records',
  delete: 'Delete records',
  export: 'Download data',
  import: 'Upload CSV data',
  approve: 'Verify delivered LPOs',
  assign: 'Bulk-assign deductions & revenues to orders',
  hold: 'Hold, resume and merge pending POS orders',
  route: 'Plan delivery routes at POS',
  pay: 'Record supplier deposits and pay supplier bills',
  archive: 'Run "Archive Now" to Google Sheets',
  backdate: 'Change entry dates and import backdated data (Owner & Admin only)',
};

export const ACTIONS = Object.keys(ACTION_LABELS);

/** Actions that can never be granted to a normal role. */
export const ADMIN_ONLY_ACTIONS = ['backdate'];

export interface AreaDef { key: string; label: string; actions: string[] }

export const AREA_DEFS: AreaDef[] = [
  { key: 'reports', label: 'Dashboard', actions: ['view', 'export'] },
  { key: 'pos', label: 'Point of Sale', actions: ['view', 'create', 'edit', 'delete', 'export', 'import', 'hold', 'route'] },
  { key: 'income', label: 'Income', actions: ['view', 'create', 'edit', 'delete', 'export', 'import', 'assign', 'backdate'] },
  { key: 'expenses', label: 'Expenses', actions: ['view', 'create', 'edit', 'delete', 'export', 'import', 'backdate'] },
  { key: 'purchases', label: 'Purchases & LPOs', actions: ['view', 'create', 'edit', 'delete', 'export', 'import', 'approve'] },
  { key: 'inventory', label: 'Inventory & Categories', actions: ['view', 'create', 'edit', 'delete', 'export', 'import'] },
  { key: 'customers', label: 'Customers', actions: ['view', 'create', 'edit', 'delete', 'export', 'import'] },
  { key: 'suppliers', label: 'Suppliers', actions: ['view', 'create', 'edit', 'delete', 'export', 'import', 'pay'] },
  { key: 'addresses', label: 'Addresses & Deliveries', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'users', label: 'Users & Roles', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'settings', label: 'Settings', actions: ['view', 'edit', 'archive'] },
];

export const AREAS = AREA_DEFS.map(a => a.key);
export const TOTAL_PERMISSIONS = AREA_DEFS.reduce((n, a) => n + a.actions.length, 0);

/** Which permission area each Income / Expenses entry type belongs to. */
export const ENTRY_AREA: Record<string, string> = {
  sale: 'income',
  deliveryFee: 'income',
  otherIncome: 'income',
  purchase: 'expenses',
  deduction: 'expenses',
  otherExpense: 'expenses',
};

export const isAdminRoleName = (name?: string | null) => (name || '').toLowerCase().includes('admin');

/** Every permission switched on. Used for the Owner and for Admin roles. */
export function fullPermissions(): PermMatrix {
  const p: PermMatrix = {};
  AREA_DEFS.forEach(a => { p[a.key] = {}; a.actions.forEach(ac => { p[a.key][ac] = true; }); });
  return p;
}

export function emptyPermissions(): PermMatrix {
  const p: PermMatrix = {};
  AREA_DEFS.forEach(a => { p[a.key] = {}; a.actions.forEach(ac => { p[a.key][ac] = false; }); });
  return p;
}

// Roles saved before an area / action existed inherit from the closest older one,
// so nobody silently loses access when new permissions are introduced.
const LEGACY_AREA: Record<string, string> = { income: 'pos', addresses: 'pos' };
const ACTION_INHERIT: Record<string, string> = { assign: 'edit', hold: 'create', route: 'create', pay: 'edit', archive: 'view' };

/** Turns whatever is stored on a role into a complete matrix of the current areas and actions. */
export function withInheritance(raw: any): PermMatrix {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out: PermMatrix = {};
  for (const def of AREA_DEFS) {
    const legacy = LEGACY_AREA[def.key];
    const base = src[def.key] ?? (legacy ? src[legacy] : undefined) ?? {};
    out[def.key] = {};
    for (const a of def.actions) {
      let v = base[a];
      if (v === undefined && ACTION_INHERIT[a]) v = base[ACTION_INHERIT[a]];
      out[def.key][a] = v === true;
    }
  }
  return out;
}

/** Forces Owner/Admin-only actions (backdate) off for normal roles. */
export function lockAdminOnly(p: PermMatrix): PermMatrix {
  for (const area of Object.keys(p)) for (const a of ADMIN_ONLY_ACTIONS) if (a in p[area]) p[area][a] = false;
  return p;
}
