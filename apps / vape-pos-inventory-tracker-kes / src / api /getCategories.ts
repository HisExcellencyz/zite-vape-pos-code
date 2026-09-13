import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'List categories',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.object({ categories: z.array(z.any()) }),
  execute: async () => {
    const { records } = await zite.categories.findAll({ limit: 200 });
    return { categories: records };
  },
});
