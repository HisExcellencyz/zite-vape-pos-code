import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'List products with optional search, category filter and sorting',
  authenticated: true,
  inputSchema: z.object({
    search: z.string().optional(),
    categoryId: z.string().optional(),
    status: z.string().optional(),
    offset: z.number().optional(),
    limit: z.number().optional(),
    sortBy: z.enum(['name', 'stock', 'price', 'value']).optional(),
    sortDir: z.enum(['asc', 'desc']).optional(),
  }),
  outputSchema: z.object({
    products: z.array(z.any()),
    hasMore: z.boolean(),
    total: z.number(),
  }),
  execute: async ({ input }) => {
    const filters: Record<string, unknown> = {};
    if (input.status) filters.status = input.status;

    // Was defaulting to 50, which hid anything past the first page. 2000 is
    // the platform's own max per call, so this comfortably covers the whole
    // catalog for a shop this size. If the catalog ever passes ~2000 items,
    // real offset-based pagination should replace this.
    const { records, hasMore } = await zite.products.findAll({
      filters: Object.keys(filters).length > 0 ? filters : undefined,
      limit: input.limit || 2000,
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

    const dir = input.sortDir === 'desc' ? -1 : 1;
    const sorted = [...filtered];
    switch (input.sortBy) {
      case 'name':
        sorted.sort((a, b) => dir * (a.productName || '').localeCompare(b.productName || ''));
        break;
      case 'stock':
        sorted.sort((a, b) => dir * ((a.stockQuantity || 0) - (b.stockQuantity || 0)));
        break;
      case 'price':
        sorted.sort((a, b) => dir * ((a.sellingPrice || 0) - (b.sellingPrice || 0)));
        break;
      case 'value':
        sorted.sort((a, b) => dir * (
          (a.costPrice || 0) * (a.stockQuantity || 0) - (b.costPrice || 0) * (b.stockQuantity || 0)
        ));
        break;
      default:
        break;
    }

    // Get total count
    const countResult = await zite.sql({
      query: `SELECT COUNT(*) AS total FROM "Products"`,
    });

    return {
      products: sorted,
      hasMore,
      total: Number(countResult.rows[0]?.total ?? 0),
    };
  },
});
