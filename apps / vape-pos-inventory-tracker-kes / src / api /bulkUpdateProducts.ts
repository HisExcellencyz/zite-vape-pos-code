import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Bulk update products (stock, prices, status)',
  authenticated: true,
  inputSchema: z.object({
    productIds: z.array(z.string()),
    action: z.enum(['activate', 'deactivate', 'updateStock', 'updatePrices']),
    stockQuantity: z.number().optional(),
    costPrice: z.number().optional(),
    sellingPrice: z.number().optional(),
  }),
  outputSchema: z.object({ success: z.boolean(), updated: z.number() }),
  execute: async ({ input }) => {
    let updated = 0;
    for (const id of input.productIds) {
      const record: Record<string, unknown> = {};
      switch (input.action) {
        case 'activate': record.status = 'Active'; break;
        case 'deactivate': record.status = 'Inactive'; break;
        case 'updateStock':
          if (input.stockQuantity != null) record.stockQuantity = input.stockQuantity;
          break;
        case 'updatePrices':
          if (input.costPrice != null) record.costPrice = input.costPrice;
          if (input.sellingPrice != null) record.sellingPrice = input.sellingPrice;
          break;
      }
      if (Object.keys(record).length > 0) {
        await zite.products.update({ id, record });
        updated++;
      }
    }
    return { success: true, updated };
  },
});
