import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { assertCan } from '../lib/permissions';
import { createStorage, renameStorage, deleteStorage } from '../lib/storages';

export default createEndpoint({
  description: 'Create, rename or delete a storage. New storages are automatically added as Storage-type locations under Addresses.',
  authenticated: true,
  inputSchema: z.object({
    action: z.enum(['create', 'rename', 'delete']),
    id: z.string().optional(),
    name: z.string().optional(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ input, context }) => {
    await assertCan(context.user.id, 'inventory', input.action === 'delete' ? 'delete' : input.action === 'create' ? 'create' : 'edit');
    if (input.action === 'create') await createStorage(input.name || '');
    else if (input.action === 'rename') {
      if (!input.id) throw new Error('Storage is required');
      await renameStorage(input.id, input.name || '');
    } else {
      if (!input.id) throw new Error('Storage is required');
      await deleteStorage(input.id);
    }
    return { success: true };
  },
});
