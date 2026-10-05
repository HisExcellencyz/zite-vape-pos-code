import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getAccess } from '../lib/permissions';
import { dayEAT, todayEAT } from '../lib/entryDates';

export default createEndpoint({
  description: 'Create an other expense entry. Backdating is only allowed for the Owner and Admin.',
  authenticated: true,
  inputSchema: z.object({
    description: z.string().min(1),
    amount: z.number().min(0.01),
    categoryId: z.string().optional(),
    branchId: z.string().optional(),
    notes: z.string().optional(),
    date: z.string().optional(),
  }),
  outputSchema: z.object({ success: z.boolean(), expense: z.any() }),
  execute: async ({ input, context }) => {
    const access = await getAccess(context.user.id);
    if (!access.can('expenses', 'create')) throw new Error('You do not have permission to add expenses. Ask an administrator to update your role.');
    let expenseDate = new Date().toISOString();
    if (input.date) {
      const d = new Date(input.date);
      if (!isNaN(d.getTime()) && dayEAT(d.toISOString()) !== todayEAT()) {
        if (!access.canBackdate) throw new Error('Only the Owner and Admin can create backdated entries');
        expenseDate = d.toISOString();
      }
    }
    const expense = await zite.otherExpenses.create({
      record: {
        expenseDate,
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
