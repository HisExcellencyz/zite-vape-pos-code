import { zite } from 'zitejs/db';

// A customer keeps ONE current location (address + coordinates on the Customers table).
// When it is replaced, the old one is archived here as a "secondary" location that is
// only shown from the Customers page. Archives live in the app settings record.

export interface ArchivedLocation {
  id: string;
  address: string | null;
  coordinates: string | null;
  plusCode: string | null;
  archivedAt: string;
  archivedBy?: string;
}

async function load() {
  const settings = await zite.businessSettings.findOne({});
  let cfg: any = {};
  try { if (settings?.customFields) cfg = JSON.parse(settings.customFields); } catch {}
  return { settings, cfg };
}

export async function archiveCustomerLocation(
  customer: { id: string; address?: string | null; coordinates?: string | null; plusCode?: string | null },
  by?: string,
): Promise<boolean> {
  if (!customer.address && !customer.coordinates) return false;
  const { settings, cfg } = await load();
  const map: Record<string, ArchivedLocation[]> = cfg.customerLocations || {};
  const list = Array.isArray(map[customer.id]) ? map[customer.id] : [];
  const same = list.some(l => (l.coordinates || '') === (customer.coordinates || '') && (l.address || '') === (customer.address || ''));
  if (same) return false;
  list.unshift({
    id: `loc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    address: customer.address || null,
    coordinates: customer.coordinates || null,
    plusCode: customer.plusCode || null,
    archivedAt: new Date().toISOString(),
    archivedBy: by,
  });
  map[customer.id] = list.slice(0, 25);
  cfg.customerLocations = map;
  const customFields = JSON.stringify(cfg);
  if (settings) await zite.businessSettings.update({ id: settings.id, record: { customFields } });
  else await zite.businessSettings.create({ record: { businessName: 'Uptown Vapes', customFields } });
  return true;
}

export async function listArchivedLocations(customerId: string): Promise<ArchivedLocation[]> {
  const { cfg } = await load();
  const list = cfg.customerLocations?.[customerId];
  return Array.isArray(list) ? list : [];
}
