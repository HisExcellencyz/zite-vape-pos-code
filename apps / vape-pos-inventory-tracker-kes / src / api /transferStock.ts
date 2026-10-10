import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { assertCan } from '../lib/permissions';
import { transferStock } from '../lib/storages';

export default createEndpoint({
  description: 'Transfer stock of one or more products from one storage to another. Total stock does not change.',
  authenticated: true,
  inputSchema: z.object({
    fromId: z.string(),
    toId: z.string(),
    items: z.array(z.object({ productId: z.string(), quantity: z.number() })).min(1),
  }),
  outputSchema: z.object({ success: z.boolean(), moved: z.number() }),
  execute: async ({ input, context }) => {
    await assertCan(context.user.id, 'inventory', 'edit');
    const moved = await transferStock(input.fromId, input.toId, input.items);
    return { success: true, moved };
  },
});
