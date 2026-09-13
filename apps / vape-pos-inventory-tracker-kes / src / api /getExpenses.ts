import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'List other expenses',
  authenticated: true,
  inputSchema: z.object({
    offset: z.number().optional(),
    limit: z.number().optional(),
  }),
  outputSchema: z.object({ expenses: z.array(z.any()), hasMore: z.boolean() }),
  execute: async ({ input }) => {
    const { records, hasMore } = await zite.otherExpenses.findAll({
      limit: input.limit || 50,
      offset: input.offset || 0,
    });
    return { expenses: records, hasMore };
  },
});
