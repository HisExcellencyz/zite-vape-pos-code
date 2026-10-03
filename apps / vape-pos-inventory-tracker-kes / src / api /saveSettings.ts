import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Save business settings. Only the fields provided are changed, and customFields keys are merged into what is already stored.',
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
    let existing = input.id ? await zite.businessSettings.findOne({ id: input.id }) : undefined;
    if (!existing) {
      const { records } = await zite.businessSettings.findAll({ limit: 1 });
      existing = records[0];
    }

    const record: Record<string, unknown> = { businessName: input.businessName };
    if (input.address !== undefined) record.address = input.address || null;
    if (input.phone !== undefined) record.phone = input.phone || null;
    if (input.email !== undefined) record.email = input.email || null;
    if (input.taxId !== undefined) record.taxId = input.taxId || null;
    if (input.defaultCurrency !== undefined) record.defaultCurrency = input.defaultCurrency || 'KES';

    // The customFields blob also holds owners, user roles and invitations, so merge instead of replacing.
    if (input.customFields !== undefined) {
      let cfg: any = {};
      try { cfg = existing?.customFields ? JSON.parse(existing.customFields) : {}; } catch {}
      let incoming: any = {};
      try { incoming = input.customFields ? JSON.parse(input.customFields) : {}; } catch {}
      record.customFields = JSON.stringify({ ...cfg, ...incoming });
    }

    if (existing) {
      const updated = await zite.businessSettings.update({ id: existing.id, record });
      return { success: true, settings: updated };
    }
    if (record.defaultCurrency === undefined) record.defaultCurrency = 'KES';
    const created = await zite.businessSettings.create({ record });
    return { success: true, settings: created };
  },
});
