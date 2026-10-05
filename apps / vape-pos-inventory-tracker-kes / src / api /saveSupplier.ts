import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { assertCan } from '../lib/permissions';
import { syncSupplierAddress } from '../lib/supplierAddress';

export default createEndpoint({
  description: 'Create or update a supplier. Every supplier is also kept as a Supplier-type location on the Addresses page.',
  authenticated: true,
  inputSchema: z.object({
    id: z.string().optional(),
    supplierName: z.string().min(1),
    phone: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
    notes: z.string().optional(),
  }),
  outputSchema: z.object({ success: z.boolean(), supplier: z.any() }),
  execute: async ({ input, context }) => {
    await assertCan(context.user.id, 'suppliers', input.id ? 'edit' : 'create');

    const record = {
      supplierName: input.supplierName,
      phone: input.phone || null,
      email: input.email || null,
      address: input.address || null,
      notes: input.notes || null,
    };

    let supplier: any;
    if (input.id) {
      supplier = await zite.suppliers.update({ id: input.id, record });
    } else {
      supplier = await zite.suppliers.create({ record: { ...record, depositBalance: 0 } });
    }

    // Automatically add / refresh the matching Supplier location (never blocks saving the supplier).
    try {
      await syncSupplierAddress({ id: supplier.id, supplierName: record.supplierName, address: record.address });
    } catch (e) {
      console.error('Could not sync supplier address', e);
    }

    return { success: true, supplier };
  },
});
