import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Create an other expense entry',
  authenticated: true,
  inputSchema: z.object({
    description: z.string().min(1),
    amount: z.number().min(0.01),
    categoryId: z.string().optional(),
    branchId: z.string().optional(),
    notes: z.string().optional(),
  }),
  outputSchema: z.object({ success: z.boolean(), expense: z.any() }),
  execute: async ({ input, context }) => {
    const expense = await zite.otherExpenses.create({
      record: {
        expenseDate: new Date().toISOString(),
        description: input.description,
        amount: input.amount,
        category: input.categoryId || null,
        branch: input.branchId || null,
        notes: input.notes || null,
        createdBy: context.user.id,
      },
    });
    return { success: true, expense };
  },
});
