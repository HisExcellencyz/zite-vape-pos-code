import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

/**
 * Inventory value (at cost) as it stood at given moments, reconstructed by
 * rolling today's stock back through sales and purchases that happened since.
 */
async function valueAt(at: string | null, branchId?: string) {
  const params: string[] = [];
  let branch = '';
  if (branchId) {
    params.push(branchId);
    branch = ` AND EXISTS (SELECT 1 FROM "BranchesProducts" bp WHERE bp."productsId" = p.id AND bp."branchesId" = $1)`;
  }
  let sold = '0', bought = '0';
  if (at) {
    params.push(at);
    const i = params.length;
    sold = `COALESCE((SELECT SUM(si."quantity") FROM "ProductsSaleItems" l
      JOIN "SaleItems" si ON si.id = l."saleItemsId"
      JOIN "SaleItemsSales" ls ON ls."saleItemsId" = si.id
      JOIN "Sales" s ON s.id = ls."salesId"
      WHERE l."productsId" = p.id AND s."status" <> 'Voided' AND s."saleDate" > $${i}), 0)`;
    bought = `COALESCE((SELECT SUM(pi."quantity") FROM "ProductsPurchaseItems" l
      JOIN "PurchaseItems" pi ON pi.id = l."purchaseItemsId"
      JOIN "PurchaseItemsPurchases" lp ON lp."purchaseItemsId" = pi.id
      JOIN "Purchases" pu ON pu.id = lp."purchasesId"
      WHERE l."productsId" = p.id AND pu."purchaseDate" > $${i}), 0)`;
  }
  const { rows } = await zite.sql({
    query: `SELECT COALESCE(SUM(COALESCE(p."costPrice",0) * GREATEST(COALESCE(p."stockQuantity",0) + ${sold} - ${bought}, 0)), 0) AS v,
                   COALESCE(SUM(GREATEST(COALESCE(p."stockQuantity",0) + ${sold} - ${bought}, 0)), 0) AS u
            FROM "Products" p WHERE COALESCE(p."status",'Active') = 'Active'${branch}`,
    params,
  });
  return { value: Number(rows[0]?.v ?? 0), units: Number(rows[0]?.u ?? 0) };
}

export default createEndpoint({
  description: 'Inventory value at the start and end of a date range (or right now)',
  authenticated: true,
  inputSchema: z.object({ start: z.string().optional(), end: z.string().optional(), branchId: z.string().optional() }),
  outputSchema: z.object({
    current: z.object({ value: z.number(), units: z.number() }),
    start: z.object({ value: z.number(), units: z.number() }).nullable(),
    end: z.object({ value: z.number(), units: z.number() }).nullable(),
  }),
  execute: async ({ input }) => {
    const [current, start, end] = await Promise.all([
      valueAt(null, input.branchId),
      input.start ? valueAt(input.start, input.branchId) : Promise.resolve(null),
      input.end ? valueAt(input.end, input.branchId) : Promise.resolve(null),
    ]);
    return { current, start, end };
  },
});
