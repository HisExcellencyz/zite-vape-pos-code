import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Create or update a supplier',
  authenticated: true,
  inputSchema: z.object({
    id: z.string().optional(),
    supplierName: z.string().min(1),
    phone: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
    notes: z.string().optional(),
  }),
  outputSchema: z.object({ success: z.boolean(), supplier: z.any() }),
  execute: async ({ input }) => {
    const record = {
      supplierName: input.supplierName,
      phone: input.phone || null,
      email: input.email || null,
      address: input.address || null,
      notes: input.notes || null,
    };

    if (input.id) {
      const updated = await zite.suppliers.update({ id: input.id, record });
      return { success: true, supplier: updated };
    } else {
      const created = await zite.suppliers.create({ record: { ...record, depositBalance: 0 } });
      return { success: true, supplier: created };
    }
  },
});
