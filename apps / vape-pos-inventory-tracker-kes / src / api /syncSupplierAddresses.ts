import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { ensureSupplierAddresses } from '../lib/supplierAddress';

export default createEndpoint({
  description: 'Makes sure every supplier has a Supplier-type location on the Addresses page (back-fills older suppliers)',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.object({ created: z.number() }),
  execute: async () => {
    return { created: await ensureSupplierAddresses() };
  },
});
