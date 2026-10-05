import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getAccess } from '../lib/permissions';
import { dayEAT, todayEAT } from '../lib/entryDates';

export default createEndpoint({
  description: 'Record an other income entry (not a product sale). Backdating is only allowed for the Owner and Admin.',
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
    const access = await getAccess(context.user.id);
    if (!access.can('income', 'create')) throw new Error('You do not have permission to add income. Ask an administrator to update your role.');
    let incomeDate = new Date().toISOString();
    if (input.date) {
      const d = new Date(input.date);
      if (!isNaN(d.getTime())) {
        if (dayEAT(d.toISOString()) !== todayEAT()) {
          if (!access.canBackdate) throw new Error('Only the Owner and Admin can create backdated entries');
          incomeDate = d.toISOString();
        }
      }
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
