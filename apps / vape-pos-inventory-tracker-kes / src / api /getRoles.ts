import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'List all roles',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.object({ roles: z.array(z.any()) }),
  execute: async () => {
    const { records } = await zite.roles.findAll({ limit: 100 });
    return { roles: records };
  },
});
