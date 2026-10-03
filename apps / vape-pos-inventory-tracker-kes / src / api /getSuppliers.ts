import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'List suppliers with search, including pending bills and number of saved locations',
  authenticated: true,
  inputSchema: z.object({
    search: z.string().optional(),
    offset: z.number().optional(),
    limit: z.number().optional(),
  }),
  outputSchema: z.object({ suppliers: z.array(z.any()), hasMore: z.boolean() }),
  execute: async ({ input }) => {
    const { records, hasMore } = await zite.suppliers.findAll({
      limit: input.limit || 2000,
      offset: input.offset || 0,
    });

    let filtered = records;
    if (input.search) {
      const s = input.search.toLowerCase();
      filtered = records.filter(sup =>
        (sup.supplierName || '').toLowerCase().includes(s) ||
        (sup.phone || '').toLowerCase().includes(s)
      );
    }

    // Pending bills and Supplier-type locations live in the app settings record.
    const settings = await zite.businessSettings.findOne({});
    let cfg: any = {};
    try { if (settings?.customFields) cfg = JSON.parse(settings.customFields); } catch {}
    const bills: any[] = Array.isArray(cfg.supplierBills) ? cfg.supplierBills : [];
    const links: Record<string, string> = cfg.addressSuppliers || {};

    const pending = new Map<string, { amount: number; count: number }>();
    for (const b of bills) {
      if (b.status !== 'pending') continue;
      const cur = pending.get(b.supplierId) || { amount: 0, count: 0 };
      cur.amount += Number(b.amount) || 0;
      cur.count += 1;
      pending.set(b.supplierId, cur);
    }
    const locCount = new Map<string, number>();
    for (const sid of Object.values(links)) locCount.set(sid, (locCount.get(sid) || 0) + 1);

    return {
      suppliers: filtered.map(s => ({
        ...s,
        billsPending: pending.get(s.id)?.amount || 0,
        billCount: pending.get(s.id)?.count || 0,
        locationCount: locCount.get(s.id) || 0,
      })),
      hasMore,
    };
  },
});
