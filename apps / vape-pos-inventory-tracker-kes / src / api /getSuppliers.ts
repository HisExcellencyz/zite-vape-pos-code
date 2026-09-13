import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'List suppliers with search',
  authenticated: true,
  inputSchema: z.object({
    search: z.string().optional(),
    offset: z.number().optional(),
    limit: z.number().optional(),
  }),
  outputSchema: z.object({ suppliers: z.array(z.any()), hasMore: z.boolean() }),
  execute: async ({ input }) => {
    const { records, hasMore } = await zite.suppliers.findAll({
      limit: input.limit || 50,
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

    return { suppliers: filtered, hasMore };
  },
});
