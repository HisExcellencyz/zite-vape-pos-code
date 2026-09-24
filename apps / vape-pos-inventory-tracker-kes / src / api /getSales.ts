import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'List sales with optional filters',
  authenticated: true,
  inputSchema: z.object({
    search: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    status: z.string().optional(),
    offset: z.number().optional(),
    limit: z.number().optional(),
  }),
  outputSchema: z.object({ sales: z.array(z.any()), hasMore: z.boolean() }),
  execute: async ({ input }) => {
    const filters: Record<string, unknown> = {};
    if (input.status) filters.status = input.status;

    const { records, hasMore } = await zite.sales.findAll({
      filters: Object.keys(filters).length > 0 ? filters : undefined,
      limit: input.limit || 2000,
      offset: input.offset || 0,
    });

    return { sales: records, hasMore };
  },
});
