import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Bulk activate or deactivate categories',
  authenticated: true,
  inputSchema: z.object({
    categoryIds: z.array(z.string()).min(1),
    action: z.enum(['activate', 'deactivate']),
  }),
  outputSchema: z.object({ success: z.boolean(), updated: z.number() }),
  execute: async ({ input }) => {
    let updated = 0;
    for (const id of input.categoryIds) {
      await zite.categories.update({ id, record: { active: input.action === 'activate' } });
      updated++;
    }
    return { success: true, updated };
  },
});
