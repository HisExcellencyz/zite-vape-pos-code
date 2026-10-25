import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

/**
 * Units sold and sales value per product (voided sales left out), optionally
 * within a date range and for one outlet. Sales with no outlet count for the
 * main outlet, as everywhere else in the app.
 */
export default createEndpoint({
  description: 'Units sold and sales value per product for a date range and outlet',
  authenticated: true,
  inputSchema: z.object({ branchId: z.string().optional(), start: z.string().optional(), end: z.string().optional() }),
  outputSchema: z.object({ byProduct: z.record(z.string(), z.object({ units: z.number(), revenue: z.number(), sales: z.number() })) }),
  execute: async ({ input }) => {
    const params: unknown[] = [];
    const where: string[] = [`s."status" <> 'Voided'`];
    if (input.start) { params.push(input.start); where.push(`s."saleDate" >= $${params.length}`); }
    if (input.end) { params.push(input.end); where.push(`s."saleDate" <= $${params.length}`); }
    if (input.branchId) {
      const branch = await zite.branches.findOne({ id: input.branchId });
      params.push(input.branchId);
      const own = `EXISTS (SELECT 1 FROM "BranchesSales" b WHERE b."salesId" = s.id AND b."branchesId" = $${params.length})`;
      const none = `NOT EXISTS (SELECT 1 FROM "BranchesSales" b WHERE b."salesId" = s.id)`;
      where.push(String(branch?.isMainBranch) === 'true' ? `(${own} OR ${none})` : own);
    }
    const { rows } = await zite.sql({
      query: `SELECT lp."productsId" AS id, SUM(si."quantity") AS units, SUM(si."lineTotal") AS revenue, COUNT(DISTINCT s.id) AS sales
              FROM "ProductsSaleItems" lp JOIN "SaleItems" si ON si.id = lp."saleItemsId"
              JOIN "SaleItemsSales" l ON l."saleItemsId" = si.id JOIN "Sales" s ON s.id = l."salesId"
             WHERE ${where.join(' AND ')} GROUP BY lp."productsId"`,
      params,
    });
    const byProduct: Record<string, { units: number; revenue: number; sales: number }> = {};
    for (const r of rows) byProduct[String(r.id)] = { units: Number(r.units) || 0, revenue: Number(r.revenue) || 0, sales: Number(r.sales) || 0 };
    return { byProduct };
  },
});
