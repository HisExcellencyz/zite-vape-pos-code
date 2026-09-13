import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'List products with optional search and category filter',
  authenticated: true,
  inputSchema: z.object({
    search: z.string().optional(),
    categoryId: z.string().optional(),
    status: z.string().optional(),
    offset: z.number().optional(),
    limit: z.number().optional(),
  }),
  outputSchema: z.object({
    products: z.array(z.any()),
    hasMore: z.boolean(),
    total: z.number(),
  }),
  execute: async ({ input }) => {
    const filters: Record<string, unknown> = {};
    if (input.status) filters.status = input.status;

    const { records, hasMore } = await zite.products.findAll({
      filters: Object.keys(filters).length > 0 ? filters : undefined,
      limit: input.limit || 50,
      offset: input.offset || 0,
    });

    let filtered = records;
    if (input.search) {
      const s = input.search.toLowerCase();
      filtered = records.filter(p =>
        (p.productName || '').toLowerCase().includes(s) ||
        (p.sku || '').toLowerCase().includes(s)
      );
    }

    // Get total count
    const countResult = await zite.sql({
      query: `SELECT COUNT(*) AS total FROM "Products"`,
    });

    return {
      products: filtered,
      hasMore,
      total: Number(countResult.rows[0]?.total ?? 0),
    };
  },
});
