import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'List customers with search, sorting, and order/spend stats',
  authenticated: true,
  inputSchema: z.object({
    search: z.string().optional(),
    offset: z.number().optional(),
    limit: z.number().optional(),
    sortBy: z.enum(['name', 'date', 'orders', 'value']).optional(),
    sortDir: z.enum(['asc', 'desc']).optional(),
  }),
  outputSchema: z.object({ customers: z.array(z.any()), hasMore: z.boolean() }),
  execute: async ({ input }) => {
    const { records, hasMore } = await zite.customers.findAll({
      limit: input.limit || 2000,
      offset: input.offset || 0,
    });

    let filtered = records;
    if (input.search) {
      const s = input.search.toLowerCase();
      filtered = records.filter(c =>
        (c.customerName || '').toLowerCase().includes(s) ||
        (c.phoneNumber || '').toLowerCase().includes(s)
      );
    }

    // Order count + total spent per customer, used both for display and for sorting.
    const statsResult = await zite.sql({
      query: `
        SELECT l."customersId" AS "customerId",
               COUNT(DISTINCT s.id) AS "orderCount",
               COALESCE(SUM(s."total"), 0) AS "totalSpent"
        FROM "CustomersSales" l
        JOIN "Sales" s ON s.id = l."salesId"
        WHERE s."status" = 'Completed'
        GROUP BY l."customersId"
      `,
    });
    const statsMap = new Map<string, { orderCount: number; totalSpent: number }>();
    for (const row of statsResult.rows) {
      statsMap.set(String(row.customerId), {
        orderCount: Number(row.orderCount || 0),
        totalSpent: Number(row.totalSpent || 0),
      });
    }

    const withStats = filtered.map(c => ({
      ...c,
      orderCount: statsMap.get(c.id)?.orderCount || 0,
      totalSpent: statsMap.get(c.id)?.totalSpent || 0,
    }));

    const dir = input.sortDir === 'desc' ? -1 : 1;
    switch (input.sortBy) {
      case 'name':
        withStats.sort((a, b) => dir * (a.customerName || '').localeCompare(b.customerName || ''));
        break;
      case 'orders':
        withStats.sort((a, b) => dir * ((a.orderCount || 0) - (b.orderCount || 0)));
        break;
      case 'value':
        withStats.sort((a, b) => dir * ((a.totalSpent || 0) - (b.totalSpent || 0)));
        break;
      case 'date':
        // Customers don't carry an explicit "date added" field, but findAll()
        // returns them in the order they were created (oldest first). So
        // ascending keeps that natural order and descending just reverses it.
        if (input.sortDir === 'desc') withStats.reverse();
        break;
      default:
        break;
    }

    return { customers: withStats, hasMore };
  },
});
