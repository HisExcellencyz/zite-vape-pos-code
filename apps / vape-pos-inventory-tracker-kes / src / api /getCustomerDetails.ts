import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Get customer details with order history',
  authenticated: true,
  inputSchema: z.object({ customerId: z.string() }),
  outputSchema: z.object({
    customer: z.any(),
    orderCount: z.number(),
    totalSpent: z.number(),
    orders: z.array(z.any()),
  }),
  execute: async ({ input }) => {
    const customer = await zite.customers.findOne({ id: input.customerId });
    if (!customer) throw new Error('Customer not found');

    const stats = await zite.sql({
      query: `
        SELECT COUNT(DISTINCT s.id) AS "orderCount",
               COALESCE(SUM(s."total"), 0) AS "totalSpent"
        FROM "Sales" s
        JOIN "CustomersSales" l ON l."salesId" = s.id
        WHERE l."customersId" = $1 AND s."status" = 'Completed'
      `,
      params: [input.customerId],
    });

    const orders = await zite.sql({
      query: `
        SELECT s.id, s."saleDate", s."total", s."status", s."paymentMethod"
        FROM "Sales" s
        JOIN "CustomersSales" l ON l."salesId" = s.id
        WHERE l."customersId" = $1
        ORDER BY s."saleDate" DESC
        LIMIT 50
      `,
      params: [input.customerId],
    });

    return {
      customer,
      orderCount: Number(stats.rows[0]?.orderCount ?? 0),
      totalSpent: Number(stats.rows[0]?.totalSpent ?? 0),
      orders: orders.rows.map(r => ({
        id: String(r.id),
        saleDate: r.saleDate ? String(r.saleDate) : null,
        total: Number(r.total || 0),
        status: String(r.status || ''),
        paymentMethod: String(r.paymentMethod || ''),
      })),
    };
  },
});
