import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { branchFilter } from '../lib/branchScope';
import { matchesQuery } from '@project/components/search/match';

export default createEndpoint({
  description: 'List products with optional search, category filter and sorting',
  authenticated: true,
  inputSchema: z.object({
    search: z.string().optional(),
    branchId: z.string().optional(),
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
    // Products, the outlet check and the total count are independent, so fetch them together.
    const [{ records, hasMore }, keep, countResult] = await Promise.all([
      zite.products.findAll({
        filters: Object.keys(filters).length > 0 ? filters : undefined,
        limit: input.limit || 2000,
        offset: input.offset || 0,
      }),
      branchFilter(input.branchId),
      zite.sql({ query: `SELECT COUNT(*) AS total FROM "Products"` }),
    ]);

    let filtered = records.filter(keep);
    if (input.search) {
      const q = input.search;
      filtered = filtered.filter(p => matchesQuery([p.productName, p.sku], q));
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

    return {
      products: sorted,
      hasMore,
      total: Number(countResult.rows[0]?.total ?? 0),
    };
  },
});