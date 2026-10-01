import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { branchFilter } from '../lib/branchScope';

export default createEndpoint({
  description: 'List purchases with optional filters',
  authenticated: true,
  inputSchema: z.object({
    branchId: z.string().optional(),
    offset: z.number().optional(),
    limit: z.number().optional(),
  }),
  outputSchema: z.object({ purchases: z.array(z.any()), hasMore: z.boolean() }),
  execute: async ({ input }) => {
    const { records, hasMore } = await zite.purchases.findAll({
      limit: input.limit || 2000,
      offset: input.offset || 0,
    });
    const keep = await branchFilter(input.branchId);
    return { purchases: records.filter(keep), hasMore };
  },
});
