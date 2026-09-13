import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Create a purchase with items, optionally deducting from supplier deposit',
  authenticated: true,
  inputSchema: z.object({
    supplierId: z.string().optional(),
    items: z.array(z.object({
      productId: z.string(),
      quantity: z.number().min(1),
      unitPrice: z.number(),
    })),
    paymentType: z.enum(['cash', 'deposit']),
    notes: z.string().optional(),
    branchId: z.string().optional(),
  }),
  outputSchema: z.object({ success: z.boolean(), purchase: z.any() }),
  execute: async ({ input, context }) => {
    const total = input.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

    // If paying from deposit, check balance
    if (input.paymentType === 'deposit') {
      if (!input.supplierId) throw new Error('Supplier is required for deposit payment');
      const supplier = await zite.suppliers.findOne({ id: input.supplierId });
      if (!supplier) throw new Error('Supplier not found');
      if ((supplier.depositBalance || 0) < total) {
        throw new Error(`Insufficient deposit balance. Available: KES ${(supplier.depositBalance || 0).toLocaleString()}, Required: KES ${total.toLocaleString()}`);
      }
    }

    const purchase = await zite.purchases.create({
      record: {
        purchaseDate: new Date().toISOString(),
        supplier: input.supplierId || null,
        branch: input.branchId || null,
        total,
        paymentType: input.paymentType === 'deposit' ? 'From Deposit' : 'Cash',
        notes: input.notes || null,
        createdBy: context.user.id,
      },
    });

    // Create purchase items
    const itemRecords = input.items.map(i => ({
      purchase: purchase.id,
      product: i.productId,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      lineTotal: i.unitPrice * i.quantity,
    }));
    if (itemRecords.length > 0) {
      await zite.purchaseItems.bulkCreate({ records: itemRecords });
    }

    // Add stock to products
    for (const item of input.items) {
      const product = await zite.products.findOne({ id: item.productId });
      if (product) {
        await zite.products.update({
          id: item.productId,
          record: { stockQuantity: (product.stockQuantity || 0) + item.quantity },
        });
      }
    }

    // Deduct from supplier deposit if applicable
    if (input.paymentType === 'deposit' && input.supplierId) {
      const supplier = await zite.suppliers.findOne({ id: input.supplierId });
      const newBalance = (supplier?.depositBalance || 0) - total;
      await zite.suppliers.update({
        id: input.supplierId,
        record: { depositBalance: newBalance },
      });

      // Record transaction
      await zite.supplierTransactions.create({
        record: {
          supplier: input.supplierId,
          type: 'Purchase Deduction',
          amount: total,
          runningBalance: newBalance,
          transactionDate: new Date().toISOString(),
          notes: `Purchase #${purchase.purchaseNumber || purchase.id}`,
        },
      });
    }

    return { success: true, purchase };
  },
});
