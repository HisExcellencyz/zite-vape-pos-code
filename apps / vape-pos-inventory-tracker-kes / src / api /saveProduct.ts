import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Create or update a product',
  authenticated: true,
  inputSchema: z.object({
    id: z.string().optional(),
    productName: z.string().min(1),
    sku: z.string().min(1),
    costPrice: z.number(),
    sellingPrice: z.number(),
    category: z.string().optional(),
    stockQuantity: z.number().optional(),
    reorderLevel: z.number().optional(),
    taxRate: z.number().optional(),
    description: z.string().optional(),
    status: z.string().optional(),
  }),
  outputSchema: z.object({ success: z.boolean(), product: z.any() }),
  execute: async ({ input }) => {
    // Check SKU uniqueness
    const existing = await zite.products.findOne({ filters: { sku: input.sku } });
    if (existing && (!input.id || existing.id !== input.id)) {
      throw new Error('A product with this SKU already exists');
    }

    // Auto-set inactive if cost or selling price is 0
    let status = input.status || 'Active';
    if (input.costPrice === 0 || input.sellingPrice === 0) {
      status = 'Inactive';
    }

    const record: Record<string, unknown> = {
      productName: input.productName,
      sku: input.sku,
      costPrice: input.costPrice,
      sellingPrice: input.sellingPrice,
      stockQuantity: input.stockQuantity ?? 0,
      reorderLevel: input.reorderLevel ?? 5,
      taxRate: input.taxRate ?? 0,
      description: input.description || null,
      status,
    };
    if (input.category) record.category = input.category;

    if (input.id) {
      const updated = await zite.products.update({ id: input.id, record });
      return { success: true, product: updated };
    } else {
      const created = await zite.products.create({ record });
      return { success: true, product: created };
    }
  },
});
