import { zite } from 'zitejs/db';

/**
 * Every supplier gets a matching Supplier-type location on the Addresses page.
 * The link supplier -> address is kept in the app settings record (same place Addresses already uses),
 * plus customFields.supplierPrimaryAddress so renaming/editing the supplier updates the same location.
 */
export async function syncSupplierAddress(
  supplier: { id: string; supplierName?: string | null; address?: string | null },
  coordinates?: string | null,
) {
  const settings = await zite.businessSettings.findOne({});
  let cfg: any = {};
  try { if (settings?.customFields) cfg = JSON.parse(settings.customFields); } catch {}
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
    return addrId;
  }

  const created = await zite.addresses.create({ record: { ...data, active: true } });
  links[created.id] = supplier.id;
  primary[supplier.id] = created.id;
  cfg.addressSuppliers = links;
  cfg.supplierPrimaryAddress = primary;
  const customFields = JSON.stringify(cfg);
  if (settings) await zite.businessSettings.update({ id: settings.id, record: { customFields } });
  else await zite.businessSettings.create({ record: { businessName: 'Uptown Vapes', customFields } });
  return created.id;
}
