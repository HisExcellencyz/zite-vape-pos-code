import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { normalizeAddrType } from '../lib/addressTypes';

// Which supplier / storage a location belongs to is kept in the app settings record
// (customFields.addressSuppliers / customFields.addressStorages), since the Addresses table has no such columns.
async function setLinks(addressId: string, supplierId: string | null, storageId: string | null) {
  const settings = await zite.businessSettings.findOne({});
  let cfg: any = {};
  try { if (settings?.customFields) cfg = JSON.parse(settings.customFields); } catch {}
  const sup: Record<string, string> = cfg.addressSuppliers || {};
  const sto: Record<string, string> = cfg.addressStorages || {};
  if ((sup[addressId] || null) === supplierId && (sto[addressId] || null) === storageId) return;
  if (supplierId) sup[addressId] = supplierId; else delete sup[addressId];
  if (storageId) sto[addressId] = storageId; else delete sto[addressId];
  cfg.addressSuppliers = sup;
  cfg.addressStorages = sto;
  const customFields = JSON.stringify(cfg);
  if (settings) await zite.businessSettings.update({ id: settings.id, record: { customFields } });
  else await zite.businessSettings.create({ record: { businessName: 'Uptown Vapes', customFields } });
}

export default createEndpoint({
  description: 'Create or update a location (Supplier, Storage, Pick-up, Drop-off or Start/End). The name is independent of the supplier / storage name.',
  authenticated: true,
  inputSchema: z.object({
    id: z.string().optional(),
    addressName: z.string().min(1),
    type: z.string(),
    supplierId: z.string().optional(),
    storageId: z.string().optional(),
    fullAddress: z.string().optional(),
    plusCode: z.string().optional(),
    coordinates: z.string().optional(),
    notes: z.string().optional(),
    active: z.boolean().optional(),
  }),
  outputSchema: z.object({ success: z.boolean(), address: z.any() }),
  execute: async ({ input }) => {
    const type = normalizeAddrType(input.type);
    const data: any = {
      addressName: input.addressName,
      type,
      fullAddress: input.fullAddress || null,
      plusCode: input.plusCode || null,
      coordinates: input.coordinates || null,
      notes: input.notes || null,
    };
    if (input.active !== undefined) data.active = input.active;

    let address: any;
    if (input.id) {
      await zite.addresses.update({ id: input.id, record: data });
      address = await zite.addresses.findOne({ id: input.id });
    } else {
      data.active = true;
      address = await zite.addresses.create({ record: data });
    }

    const supplierId = type === 'supplier' ? input.supplierId || null : null;
    const storageId = type === 'storage' ? input.storageId || null : null;
    const id = input.id || address?.id;
    if (id) await setLinks(id, supplierId, storageId);

    return { success: true, address: { ...address, supplierId, storageId } };
  },
});
