import { zite } from 'zitejs/db';

// Every supplier gets a "Supplier" location on the Addresses page. The link between a
// location and its supplier is kept in the app settings record (customFields.addressSuppliers),
// and customFields.supplierAutoAddress remembers which supplier already got its automatic
// location, so a location the user later deletes is not recreated.

type S = { id: string; supplierName?: string; address?: string };
let inflight: Promise<boolean> | null = null;

async function run(suppliers: S[], update: boolean): Promise<boolean> {
  const settings = await zite.businessSettings.findOne({});
  let cfg: any = {};
  try { if (settings?.customFields) cfg = JSON.parse(settings.customFields); } catch {}
  const auto: Record<string, string> = cfg.supplierAutoAddress || {};
  const links: Record<string, string> = cfg.addressSuppliers || {};
  const linkedSuppliers = new Set(Object.values(links));
  let changed = false;

  for (const s of suppliers) {
    const existing = auto[s.id];
    if (existing) {
      if (update && existing !== 'existing') {
        try {
          await zite.addresses.update({ id: existing, record: { addressName: s.supplierName || 'Supplier', fullAddress: s.address || null } });
        } catch {}
      }
      continue;
    }
    if (linkedSuppliers.has(s.id)) { auto[s.id] = 'existing'; changed = true; continue; }
    const addr = await zite.addresses.create({
      record: {
        addressName: s.supplierName || 'Supplier',
        type: 'supplier',
        fullAddress: s.address || null,
        plusCode: null,
        coordinates: null,
        notes: null,
        active: true,
      },
    });
    links[addr.id] = s.id;
    auto[s.id] = addr.id;
    changed = true;
  }

  if (changed) {
    cfg.addressSuppliers = links;
    cfg.supplierAutoAddress = auto;
    const customFields = JSON.stringify(cfg);
    if (settings) await zite.businessSettings.update({ id: settings.id, record: { customFields } });
    else await zite.businessSettings.create({ record: { businessName: 'Uptown Vapes', customFields } });
  }
  return changed;
}

/** Makes sure each supplier has its Supplier-type location (optionally refreshing the name/address of the automatic one). */
export async function syncSupplierAddresses(suppliers: S[], update = false): Promise<boolean> {
  while (inflight) { try { await inflight; } catch {} }
  inflight = run(suppliers, update);
  try { return await inflight; } finally { inflight = null; }
}
