import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Units sold per product (completed sales only) for an optional date range. Used by the product search pickers on the LPO and Transfer Stock dialogs.',
  authenticated: true,
  inputSchema: z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }),
  outputSchema: z.object({ sold: z.record(z.number()) }),
  execute: async ({ input }) => {
    const params: string[] = [];
    let dateFilter = '';
    if (input.startDate) {
      params.push(input.startDate);
      dateFilter += ` AND s."saleDate" >= $${params.length}`;
    }
    if (input.endDate) {
      params.push(input.endDate);
      dateFilter += ` AND s."saleDate" <= $${params.length}`;
    }

    const result = await zite.sql({
      query: `
        SELECT l."productsId" AS "productId",
               COALESCE(SUM(si."quantity"), 0) AS "sold"
        FROM "ProductsSaleItems" l
        JOIN "SaleItems" si ON si.id = l."saleItemsId"
        JOIN "SaleItemsSales" ls ON ls."saleItemsId" = si.id
        JOIN "Sales" s ON s.id = ls."salesId"
        WHERE s."status" = 'Completed'${dateFilter}
        GROUP BY l."productsId"
      `,
      params,
    });

    const sold: Record<string, number> = {};
    for (const r of result.rows) sold[String(r.productId)] = Number(r.sold || 0);
    return { sold };
  },
});
