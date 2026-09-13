import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Create or update an address/pickup point',
  authenticated: true,
  inputSchema: z.object({
    id: z.string().optional(),
    addressName: z.string().min(1),
    type: z.enum(['pickup', 'delivery', 'branch', 'other']),
    fullAddress: z.string().optional(),
    plusCode: z.string().optional(),
    coordinates: z.string().optional(),
    notes: z.string().optional(),
    active: z.boolean().optional(),
  }),
  outputSchema: z.object({ success: z.boolean(), address: z.any() }),
  execute: async ({ input }) => {
    const data: any = {
      addressName: input.addressName,
      type: input.type,
      fullAddress: input.fullAddress || null,
      plusCode: input.plusCode || null,
      coordinates: input.coordinates || null,
      notes: input.notes || null,
    };
    if (input.active !== undefined) data.active = input.active;

    if (input.id) {
      await zite.addresses.update({ id: input.id, record: data });
      const address = await zite.addresses.findOne({ id: input.id });
      return { success: true, address };
    } else {
      data.active = true;
      const address = await zite.addresses.create({ record: data });
      return { success: true, address };
    }
  },
});
