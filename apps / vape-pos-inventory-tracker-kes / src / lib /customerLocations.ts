import { zite } from 'zitejs/db';

// Previous ("secondary") customer locations are kept in the app settings record
// (customFields.customerLocations[customerId]) so no new table is needed.
// They are only shown from the Customers page.

export interface ArchivedLocation {
  address?: string | null;
  coordinates?: string | null;
  plusCode?: string | null;
  archivedAt: string;
}

async function loadCfg() {
  const settings = await zite.businessSettings.findOne({});
  let cfg: any = {};
  try { if (settings?.customFields) cfg = JSON.parse(settings.customFields); } catch {}
  return { settings, cfg };
}

/** Moves a customer's previous location into the archive (skips empty and duplicate entries). */
export async function archiveCustomerLocation(
  customerId: string,
  prev: { address?: string | null; coordinates?: string | null; plusCode?: string | null },
) {
  if (!prev.coordinates && !prev.address) return;
  const { settings, cfg } = await loadCfg();
  const all: Record<string, ArchivedLocation[]> = cfg.customerLocations || {};
  const list = all[customerId] || [];
  const dup = list.some(l => (l.coordinates || '') === (prev.coordinates || '') && (l.address || '') === (prev.address || ''));
  if (!dup) {
    list.unshift({
      address: prev.address || null,
      coordinates: prev.coordinates || null,
      plusCode: prev.plusCode || null,
      archivedAt: new Date().toISOString(),
    });
  }
  all[customerId] = list;
  cfg.customerLocations = all;
  const customFields = JSON.stringify(cfg);
  if (settings) await zite.businessSettings.update({ id: settings.id, record: { customFields } });
  else await zite.businessSettings.create({ record: { businessName: 'Uptown Vapes', customFields } });
}

export async function getArchivedLocations(customerId: string): Promise<ArchivedLocation[]> {
  const { cfg } = await loadCfg();
  return (cfg.customerLocations?.[customerId] as ArchivedLocation[]) || [];
}
