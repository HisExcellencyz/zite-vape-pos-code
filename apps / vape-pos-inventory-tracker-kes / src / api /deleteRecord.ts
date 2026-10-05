import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { assertCan } from '../lib/permissions';
import { removeSupplierAddress } from '../lib/supplierAddress';

export default createEndpoint({
  description: 'Delete a record from any supported table',
  authenticated: true,
  inputSchema: z.object({
    table: z.enum(['products', 'customers', 'suppliers', 'categories', 'sales', 'roles', 'purchaseOrders', 'addresses']),
    id: z.string(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ input, context }) => {
    const AREA_OF: Record<string, string> = {
      products: 'inventory',
      customers: 'customers',
      suppliers: 'suppliers',
      categories: 'categories',
      sales: 'income',
      roles: 'users',
      purchaseOrders: 'purchaseOrders',
      addresses: 'addresses',
    };
    await assertCan(context.user.id, AREA_OF[input.table], 'delete');
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
    if (input.table === 'suppliers') { try { await removeSupplierAddress(input.id); } catch {} }
    return { success: true };
  },
});
