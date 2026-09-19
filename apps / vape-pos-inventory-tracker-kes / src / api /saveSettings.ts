import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Save business settings',
  authenticated: true,
  inputSchema: z.object({
    id: z.string().optional(),
    businessName: z.string().min(1),
    address: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    taxId: z.string().optional(),
    defaultCurrency: z.string().optional(),
    customFields: z.string().optional(),
  }),
  outputSchema: z.object({ success: z.boolean(), settings: z.any() }),
  execute: async ({ input }) => {
    const record = {
      businessName: input.businessName,
      address: input.address || null,
      phone: input.phone || null,
      email: input.email || null,
      taxId: input.taxId || null,
      defaultCurrency: input.defaultCurrency || 'KES',
      customFields: input.customFields || null,
    };

    if (input.id) {
      const updated = await zite.businessSettings.update({ id: input.id, record });
      return { success: true, settings: updated };
    } else {
      const created = await zite.businessSettings.create({ record });
      return { success: true, settings: created };
    }
  },
});
