import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Record an other income entry (not a product sale). Can be backdated.',
  authenticated: true,
  inputSchema: z.object({
    description: z.string().min(1),
    amount: z.number().min(0.01),
    date: z.string().optional(),
    branchId: z.string().optional(),
    notes: z.string().optional(),
  }),
  outputSchema: z.object({ success: z.boolean(), income: z.any() }),
  execute: async ({ input, context }) => {
    let incomeDate = new Date().toISOString();
    if (input.date) {
      const d = new Date(input.date);
      if (!isNaN(d.getTime())) incomeDate = d.toISOString();
    }
    const income = await zite.otherIncome.create({
      record: {
        incomeDate,
        description: input.description,
        amount: input.amount,
        branch: input.branchId || null,
        notes: input.notes || null,
        createdBy: context.user.id,
      },
    });
    return { success: true, income };
  },
});
