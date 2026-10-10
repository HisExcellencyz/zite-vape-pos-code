import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { ensureStorages } from '../lib/storages';

export default createEndpoint({
  description: 'List storages (Office, custom storages and one per Own Rider) with the stock held in each. The Office quantity of a product is its total stock minus the quantities in the other storages.',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.object({ storages: z.array(z.any()), stock: z.any() }),
  execute: async () => {
    const { storages, stock } = await ensureStorages();
    return { storages, stock };
  },
});
