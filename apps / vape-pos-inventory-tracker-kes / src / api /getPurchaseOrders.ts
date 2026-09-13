import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'List purchase orders with supplier info',
  authenticated: true,
  inputSchema: z.object({
    status: z.string().optional(),
  }),
  outputSchema: z.object({ orders: z.array(z.any()) }),
  execute: async ({ input }) => {
    const filters: any = {};
    if (input.status) filters.status = input.status;
    const { records } = await zite.purchaseOrders.findAll({ filters, limit: 500 });

    // Enrich with supplier names
    const supplierIds = [...new Set(records.map(r => r.supplier?.[0]).filter((x): x is string => !!x))];
    const supplierMap: Record<string, string> = {};
    for (const sid of supplierIds) {
      const s = await zite.suppliers.findOne({ id: sid });
      if (s) supplierMap[sid] = s.supplierName || 'Unknown';
    }

    const orders = records.map(r => ({
      ...r,
      supplierName: r.supplier?.[0] ? supplierMap[r.supplier[0]] || 'Unknown' : 'None',
    }));

    return { orders };
  },
});
