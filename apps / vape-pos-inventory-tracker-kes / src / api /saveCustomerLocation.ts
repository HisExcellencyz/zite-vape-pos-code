import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: "Save an order's drop-off pin as the customer's address and coordinates. Other customer details are left untouched.",
  authenticated: true,
  inputSchema: z.object({
    customerId: z.string(),
    coordinates: z.string().min(1),
    address: z.string().optional(),
    plusCode: z.string().optional(),
  }),
  outputSchema: z.object({ success: z.boolean(), customer: z.any() }),
  execute: async ({ input }) => {
    const existing = await zite.customers.findOne({ id: input.customerId });
    if (!existing) throw new Error('Customer not found');

    const record: Record<string, unknown> = { coordinates: input.coordinates };
    if (input.address) record.address = input.address;
    if (input.plusCode) record.plusCode = input.plusCode;

    const customer = await zite.customers.update({ id: input.customerId, record });
    return { success: true, customer };
  },
});
