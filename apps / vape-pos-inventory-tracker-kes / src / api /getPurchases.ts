import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'List purchases with optional filters',
  authenticated: true,
  inputSchema: z.object({
    offset: z.number().optional(),
    limit: z.number().optional(),
  }),
  outputSchema: z.object({ purchases: z.array(z.any()), hasMore: z.boolean() }),
  execute: async ({ input }) => {
    const { records, hasMore } = await zite.purchases.findAll({
      limit: input.limit || 2000,
      offset: input.offset || 0,
    });
    return { purchases: records, hasMore };
  },
});
