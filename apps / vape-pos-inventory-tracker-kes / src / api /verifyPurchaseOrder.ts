import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Verify items on a purchase order and auto-record as purchase',
  authenticated: true,
  inputSchema: z.object({
    orderId: z.string(),
    items: z.array(z.object({
      productId: z.string(),
      productName: z.string(),
      sku: z.string().optional(),
      quantity: z.number(),
      unitPrice: z.number(),
      verified: z.boolean(),
      verifiedQty: z.number(),
    })),
  }),
  outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  execute: async ({ input, context }) => {
    const order = await zite.purchaseOrders.findOne({ id: input.orderId });
    if (!order) throw new Error('Purchase order not found');

    // Update items JSON with verification status
    const allVerified = input.items.every(i => i.verified);
    const someVerified = input.items.some(i => i.verified);
    const newStatus = allVerified ? 'verified' : someVerified ? 'partial' : order.status;

    await zite.purchaseOrders.update({
      id: input.orderId,
      record: {
        itemsJson: JSON.stringify(input.items),
        status: newStatus,
      },
    });

    // If all items verified, create a purchase record (cash payment, not from deposit)
    if (allVerified) {
      const verifiedItems = input.items.filter(i => i.verified && i.verifiedQty > 0);
      const total = verifiedItems.reduce((sum, i) => sum + i.unitPrice * i.verifiedQty, 0);

      const purchase = await zite.purchases.create({
        record: {
          purchaseDate: new Date().toISOString(),
          supplier: order.supplier?.[0] || null,
          branch: order.branch?.[0] || null,
          total,
          paymentType: 'Cash',
          notes: `From ${order.lpoNumber}`,
          createdBy: context.user.id,
        },
      });

      // Create purchase items
      const itemRecords = verifiedItems.map(i => ({
        purchase: purchase.id,
        product: i.productId,
        quantity: i.verifiedQty,
        unitPrice: i.unitPrice,
        lineTotal: i.unitPrice * i.verifiedQty,
      }));
      if (itemRecords.length > 0) {
        await zite.purchaseItems.bulkCreate({ records: itemRecords });
      }

      // Add stock to products
      for (const item of verifiedItems) {
        const product = await zite.products.findOne({ id: item.productId });
        if (product) {
          await zite.products.update({
            id: item.productId,
            record: { stockQuantity: (product.stockQuantity || 0) + item.verifiedQty },
          });
        }
      }

      return { success: true, message: `All items verified. Purchase recorded (KES ${total.toLocaleString()}) and stock updated.` };
    }

    return { success: true, message: someVerified ? 'Partially verified. Complete verification for remaining items.' : 'Verification status updated.' };
  },
});
