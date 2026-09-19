import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Create or update a customer',
  authenticated: true,
  inputSchema: z.object({
    id: z.string().optional(),
    phoneNumber: z.string().min(1),
    customerName: z.string().min(1),
    email: z.string().optional(),
    address: z.string().optional(),
    notes: z.string().optional(),
  }),
  outputSchema: z.object({ success: z.boolean(), customer: z.any() }),
  execute: async ({ input }) => {
    // Phone number must start with +
    let phone = input.phoneNumber.trim();
    if (!phone.startsWith('+')) phone = '+' + phone;

    // Check phone uniqueness
    const existing = await zite.customers.findOne({ filters: { phoneNumber: phone } });
    if (existing && (!input.id || existing.id !== input.id)) {
      throw new Error('A customer with this phone number already exists');
    }

    const record = {
      phoneNumber: phone,
      customerName: input.customerName,
      email: input.email || null,
      address: input.address || null,
      notes: input.notes || null,
    };

    if (input.id) {
      const updated = await zite.customers.update({ id: input.id, record });
      return { success: true, customer: updated };
    } else {
      const created = await zite.customers.create({ record });
      return { success: true, customer: created };
    }
  },
});
