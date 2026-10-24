import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Record a deposit to a supplier',
  authenticated: true,
  inputSchema: z.object({
    supplierId: z.string(),
    amount: z.number().min(0.01),
    notes: z.string().optional(),
    branchId: z.string().optional(),
  }),
  outputSchema: z.object({ success: z.boolean(), deposit: z.any() }),
  execute: async ({ input }) => {
    const supplier = await zite.suppliers.findOne({ id: input.supplierId });
    if (!supplier) throw new Error('Supplier not found');

    const newBalance = (supplier.depositBalance || 0) + input.amount;

    // Create deposit record
    const deposit = await zite.supplierDeposits.create({
      record: {
        supplier: input.supplierId,
        amount: input.amount,
        date: new Date().toISOString().split('T')[0],
        notes: input.notes || null,
        branch: input.branchId || null,
      },
    });

    // Update supplier balance
    await zite.suppliers.update({
      id: input.supplierId,
      record: { depositBalance: newBalance },
    });

    // Record transaction
    await zite.supplierTransactions.create({
      record: {
        supplier: input.supplierId,
        type: 'Deposit',
        amount: input.amount,
        runningBalance: newBalance,
        transactionDate: new Date().toISOString(),
        notes: input.notes || `Deposit #${deposit.depositNumber || deposit.id}`,
      },
    });

    return { success: true, deposit };
  },
});
