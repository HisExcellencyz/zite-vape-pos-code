import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Delete a record from any supported table',
  authenticated: true,
  inputSchema: z.object({
    table: z.enum(['products', 'customers', 'suppliers', 'categories', 'sales', 'roles', 'purchaseOrders', 'addresses']),
    id: z.string(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ input }) => {
    const tableMap = {
      products: zite.products,
      customers: zite.customers,
      suppliers: zite.suppliers,
      categories: zite.categories,
      sales: zite.sales,
      roles: zite.roles,
      purchaseOrders: zite.purchaseOrders,
      addresses: zite.addresses,
    } as const;

    const table = tableMap[input.table];
    await (table as any).delete({ id: input.id });
    return { success: true };
  },
});
