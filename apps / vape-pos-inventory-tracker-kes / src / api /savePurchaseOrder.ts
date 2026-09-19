import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Create or update a purchase order (LPO)',
  authenticated: true,
  inputSchema: z.object({
    id: z.string().optional(),
    supplierId: z.string(),
    branchId: z.string().optional(),
    orderDate: z.string(),
    expectedDeliveryDate: z.string().optional(),
    notes: z.string().optional(),
    items: z.array(z.object({
      productId: z.string(),
      productName: z.string(),
      sku: z.string().optional(),
      quantity: z.number().min(1),
      unitPrice: z.number(),
      verified: z.boolean().optional(),
      verifiedQty: z.number().optional(),
    })),
  }),
  outputSchema: z.object({ success: z.boolean(), order: z.any() }),
  execute: async ({ input }) => {
    const total = input.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    const itemsJson = JSON.stringify(input.items);

    // Generate LPO number
    const { records: existing } = await zite.purchaseOrders.findAll({ limit: 1 });
    const lpoNum = input.id ? undefined : `LPO-${String((existing.length || 0) + 1).padStart(4, '0')}`;

    if (input.id) {
      await zite.purchaseOrders.update({
        id: input.id,
        record: {
          supplier: input.supplierId,
          branch: input.branchId || null,
          orderDate: input.orderDate,
          expectedDeliveryDate: input.expectedDeliveryDate || null,
          notes: input.notes || null,
          totalAmount: total,
          itemsJson,
        },
      });
      const order = await zite.purchaseOrders.findOne({ id: input.id });
      return { success: true, order };
    } else {
      const order = await zite.purchaseOrders.create({
        record: {
          lpoNumber: lpoNum!,
          supplier: input.supplierId,
          branch: input.branchId || null,
          orderDate: input.orderDate,
          expectedDeliveryDate: input.expectedDeliveryDate || null,
          status: 'draft',
          totalAmount: total,
          notes: input.notes || null,
          itemsJson,
        },
      });
      return { success: true, order };
    }
  },
});
