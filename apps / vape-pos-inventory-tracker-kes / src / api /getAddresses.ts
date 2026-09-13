import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'List all saved addresses and pickup points',
  authenticated: true,
  inputSchema: z.object({ type: z.string().optional() }),
  outputSchema: z.object({ addresses: z.array(z.any()) }),
  execute: async ({ input }) => {
    const filters: any = {};
    if (input.type) filters.type = input.type;
    const { records } = await zite.addresses.findAll({ filters, limit: 500 });
    return { addresses: records };
  },
});
