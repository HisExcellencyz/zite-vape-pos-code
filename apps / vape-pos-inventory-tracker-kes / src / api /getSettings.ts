import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Get business settings',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.object({ settings: z.any().nullable() }),
  execute: async () => {
    const { records } = await zite.businessSettings.findAll({ limit: 1 });
    return { settings: records[0] || null };
  },
});
