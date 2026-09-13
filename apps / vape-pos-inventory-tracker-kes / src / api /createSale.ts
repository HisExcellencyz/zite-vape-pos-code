import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Create a POS sale with items',
  authenticated: true,
  inputSchema: z.object({
    items: z.array(z.object({
      productId: z.string(),
      quantity: z.number().min(1),
      unitPrice: z.number(),
      discount: z.number().optional(),
      taxAmount: z.number().optional(),
    })),
    customerId: z.string().optional(),
    paymentMethod: z.string(),
    discount: z.number().optional(),
    notes: z.string().optional(),
    branchId: z.string().optional(),
    pickupPoint: z.string().optional(),
    deliveryAddress: z.string().optional(),
    deliveryCoordinates: z.string().optional(),
    stops: z.string().optional(),
    deliveryDistanceKm: z.number().optional(),
  }),
  outputSchema: z.object({ success: z.boolean(), sale: z.any() }),
  execute: async ({ input, context }) => {
    let subtotal = 0;
    let totalTax = 0;

    const lineItems = input.items.map(item => {
      const lineTotal = item.unitPrice * item.quantity - (item.discount || 0);
      subtotal += lineTotal;
      totalTax += item.taxAmount || 0;
      return { ...item, lineTotal };
    });

    const total = subtotal - (input.discount || 0);

    const sale = await zite.sales.create({
      record: {
        saleDate: new Date().toISOString(),
        customer: input.customerId || null,
        branch: input.branchId || null,
        paymentMethod: input.paymentMethod,
        subtotal,
        taxAmount: totalTax,
        discount: input.discount || 0,
        total,
        status: 'Completed',
        notes: input.notes || null,
        createdBy: context.user.id,
        pickupPoint: input.pickupPoint || null,
        deliveryAddress: input.deliveryAddress || null,
        deliveryCoordinates: input.deliveryCoordinates || null,
        stops: input.stops || null,
        deliveryDistanceKm: input.deliveryDistanceKm || null,
      },
    });

    // Create sale items
    const saleItemRecords = lineItems.map(item => ({
      sale: sale.id,
      product: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      taxAmount: item.taxAmount || 0,
      discount: item.discount || 0,
      lineTotal: item.lineTotal,
    }));

    if (saleItemRecords.length > 0) {
      await zite.saleItems.bulkCreate({ records: saleItemRecords });
    }

    // Deduct stock
    for (const item of input.items) {
      const product = await zite.products.findOne({ id: item.productId });
      if (product) {
        const newQty = Math.max(0, (product.stockQuantity || 0) - item.quantity);
        await zite.products.update({
          id: item.productId,
          record: { stockQuantity: newQty },
        });
      }
    }

    return { success: true, sale };
  },
});
