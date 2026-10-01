import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { branchFilter } from '../lib/branchScope';

export default createEndpoint({
  description: 'List other income entries, newest first',
  authenticated: true,
  inputSchema: z.object({
    branchId: z.string().optional(),
    limit: z.number().optional(),
  }),
  outputSchema: z.object({ income: z.array(z.any()) }),
  execute: async ({ input }) => {
    const { records } = await zite.otherIncome.findAll({ limit: input.limit || 500 });
    const keep = await branchFilter(input.branchId);
    const income = records.filter(keep).sort((a, b) =>
      String(b.incomeDate || '').localeCompare(String(a.incomeDate || '')),
    );
    return { income };
  },
});
