import { zite } from 'zitejs/db';

/**
 * Every supplier gets a matching Supplier-type location on the Addresses page.
 * The link address -> supplier is kept in the app settings record (customFields.addressSuppliers, the same
 * place the Addresses page already uses), plus customFields.supplierPrimaryAddress (supplier -> address)
 * so renaming/editing the supplier updates the same location instead of creating a new one.
 */

async function loadCfg() {
  const settings = await zite.businessSettings.findOne({});
  let cfg: any = {};
  try { if (settings?.customFields) cfg = JSON.parse(settings.customFields); } catch {}
  return { settings, cfg };
}

async function saveCfg(settings: any, cfg: any) {
  const customFields = JSON.stringify(cfg);
  if (settings) await zite.businessSettings.update({ id: settings.id, record: { customFields } });
  else await zite.businessSettings.create({ record: { businessName: 'Uptown Vapes', customFields } });
}

export async function syncSupplierAddress(
  supplier: { id: string; supplierName?: string | null; address?: string | null },
  coordinates?: string | null,
) {
  const { settings, cfg } = await loadCfg();
  const links: Record<string, string> = cfg.addressSuppliers || {};
  const primary: Record<string, string> = cfg.supplierPrimaryAddress || {};

  let addrId: string | undefined = primary[supplier.id];
  if (addrId) {
    const ex = await zite.addresses.findOne({ id: addrId });
    if (!ex) addrId = undefined;
  }

  const data: Record<string, unknown> = {
    addressName: supplier.supplierName || 'Supplier',
    type: 'supplier',
    fullAddress: supplier.address || null,
  };
  if (coordinates) data.coordinates = coordinates;

  if (addrId) {
    await zite.addresses.update({ id: addrId, record: data });
    // Make sure the link exists (older records may only have the primary entry).
    if (links[addrId] !== supplier.id) {
      links[addrId] = supplier.id;
      cfg.addressSuppliers = links;
      await saveCfg(settings, cfg);
    }
    return addrId;
  }

  const created = await zite.addresses.create({ record: { ...data, active: true } });
  links[created.id] = supplier.id;
  primary[supplier.id] = created.id;
  cfg.addressSuppliers = links;
  cfg.supplierPrimaryAddress = primary;
  await saveCfg(settings, cfg);
  return created.id;
}

/**
 * Back-fills a Supplier-type location for every supplier that does not have one yet
 * (suppliers added before this feature, or created by imports). Suppliers that already have a
 * Supplier-type location linked to them (added by hand) are left alone. Returns how many were created.
 */
export async function ensureSupplierAddresses(): Promise<number> {
  const { settings, cfg } = await loadCfg();
  const links: Record<string, string> = cfg.addressSuppliers || {};
  const primary: Record<string, string> = cfg.supplierPrimaryAddress || {};

  const { records: suppliers } = await zite.suppliers.findAll({ limit: 2000 });
  const { records: addresses } = await zite.addresses.findAll({ limit: 2000 });
  const alive = new Set(addresses.map(a => a.id));

  // Suppliers that already have a live location linked to them.
  const covered = new Set<string>();
  for (const [addrId, supId] of Object.entries(links)) if (alive.has(addrId)) covered.add(supId);
  for (const [supId, addrId] of Object.entries(primary)) if (alive.has(addrId)) covered.add(supId);

  let created = 0;
  for (const s of suppliers) {
    if (covered.has(s.id)) continue;
    const a = await zite.addresses.create({
      record: { addressName: s.supplierName || 'Supplier', type: 'supplier', fullAddress: s.address || null, active: true },
    });
    links[a.id] = s.id;
    primary[s.id] = a.id;
    created++;
  }
  if (created > 0) {
    cfg.addressSuppliers = links;
    cfg.supplierPrimaryAddress = primary;
    await saveCfg(settings, cfg);
  }
  return created;
}

/** Removes the automatic location of a deleted supplier (other locations linked to it are kept). */
export async function removeSupplierAddress(supplierId: string) {
  const { settings, cfg } = await loadCfg();
  const primary: Record<string, string> = cfg.supplierPrimaryAddress || {};
  const links: Record<string, string> = cfg.addressSuppliers || {};
  const addrId = primary[supplierId];
  if (!addrId) return;
  try { await zite.addresses.delete({ id: addrId }); } catch {}
  delete primary[supplierId];
  delete links[addrId];
  cfg.supplierPrimaryAddress = primary;
  cfg.addressSuppliers = links;
  await saveCfg(settings, cfg);
}
