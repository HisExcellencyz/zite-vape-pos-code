// Permission areas and actions, shared by the browser and the endpoints.
// Backdating (changing entry dates / importing dated entries) is NOT part of the matrix:
// it is reserved for the Owner and Admin. The one exception is POS sales: a role can be
// allowed to backdate new sales with the pos.backdate flag (see canBackdateSalesRole).

/** True when a role's saved permissions allow it to record POS sales on an earlier date. */
export const canBackdateSalesRole = (raw: any) => raw?.pos?.backdate === true;

export const AREAS = [
  'pos', 'income', 'customers', 'inventory', 'categories', 'purchases', 'purchaseOrders',
  'suppliers', 'expenses', 'addresses', 'deliveries', 'reports', 'users', 'settings', 'archive',
] as const;
export const ACTIONS = ['view', 'create', 'edit', 'delete', 'export', 'import', 'approve'] as const;

export type Area = typeof AREAS[number];
export type Action = typeof ACTIONS[number];
export type PermMatrix = Record<string, Record<string, boolean>>;

export const AREA_LABELS: Record<Area, string> = {
  pos: 'POS',
  income: 'Income (sales, delivery fees, other income)',
  customers: 'Customers (incl. locations)',
  inventory: 'Inventory',
  categories: 'Categories',
  purchases: 'Purchases',
  purchaseOrders: 'Purchase Orders (LPOs)',
  suppliers: 'Suppliers (deposits, bills, locations)',
  expenses: 'Expenses (purchases, deductions, other)',
  addresses: 'Addresses',
  deliveries: 'Deliveries (heat map)',
  reports: 'Reports / Dashboard',
  users: 'Users & Roles',
  settings: 'Settings (outlets, riders)',
  archive: 'Archive to Google Sheets',
};

/**
 * Areas that were added after roles were first set up. A role saved before an area existed
 * inherits the older area's permissions until the role is edited and saved again.
 */
export const FALLBACK_AREA: Record<string, string> = {
  income: 'pos',
  addresses: 'pos',
  deliveries: 'pos',
  categories: 'inventory',
  purchaseOrders: 'purchases',
  archive: 'settings',
};

export function fullPermissions(): PermMatrix {
  const p: PermMatrix = {};
  AREAS.forEach(a => { p[a] = {}; ACTIONS.forEach(ac => { p[a][ac] = true; }); });
  return p;
}

export function emptyPermissions(): PermMatrix {
  const p: PermMatrix = {};
  AREAS.forEach(a => { p[a] = {}; ACTIONS.forEach(ac => { p[a][ac] = false; }); });
  return p;
}

/** Fills in every area/action, inheriting from the older area for areas the role never had. */
export function normalizePerms(raw?: any): PermMatrix {
  const out: PermMatrix = {};
  AREAS.forEach(a => {
    const src = raw?.[a] ?? (FALLBACK_AREA[a] ? raw?.[FALLBACK_AREA[a]] : undefined);
    out[a] = {};
    ACTIONS.forEach(ac => { out[a][ac] = src?.[ac] === true; });
  });
  return out;
}

export const isAdminRoleName = (name?: string | null) => (name || '').toLowerCase().includes('admin');