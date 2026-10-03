import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { normalizeAddrType } from '../lib/addressTypes';

export default createEndpoint({
  description: 'List saved locations. Types are normalised to supplier / pickup / dropoff / startend; Supplier locations include their supplier.',
  authenticated: true,
  inputSchema: z.object({
    type: z.string().optional(),
    supplierId: z.string().optional(),
  }),
  outputSchema: z.object({ addresses: z.array(z.any()) }),
  execute: async ({ input }) => {
    const { records } = await zite.addresses.findAll({ limit: 500 });

    const settings = await zite.businessSettings.findOne({});
    let cfg: any = {};
    try { if (settings?.customFields) cfg = JSON.parse(settings.customFields); } catch {}
    const links: Record<string, string> = cfg.addressSuppliers || {};

    const { records: suppliers } = await zite.suppliers.findAll({ limit: 2000 });
    const names = new Map(suppliers.map(s => [s.id, s.supplierName || '']));

    let addresses = records.map(a => {
      const type = normalizeAddrType(a.type);
      const supplierId = type === 'supplier' ? links[a.id] || null : null;
      return { ...a, type, supplierId, supplierName: supplierId ? names.get(supplierId) || '' : '' };
    });

    if (input.type) {
      const want = normalizeAddrType(input.type);
      addresses = addresses.filter(a => a.type === want);
    }
    if (input.supplierId) addresses = addresses.filter(a => a.supplierId === input.supplierId);

    return { addresses };
  },
});
