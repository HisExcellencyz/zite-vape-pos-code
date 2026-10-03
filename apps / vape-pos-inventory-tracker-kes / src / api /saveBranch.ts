import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Create or update an outlet/branch, including its own logo, cover photo and delivery fee',
  authenticated: true,
  inputSchema: z.object({
    id: z.string().optional(),
    branchName: z.string().min(1),
    address: z.string().optional(),
    phone: z.string().optional(),
    taxId: z.string().optional(),
    isMainBranch: z.boolean().optional(),
    active: z.boolean().optional(),
    logoUrl: z.string().optional(),
    coverPhotoUrl: z.string().optional(),
    plusCode: z.string().optional(),
    coordinates: z.string().optional(),
    deliveryFee: z.number().min(0).optional(),
    commissions: z.array(z.object({ name: z.string(), type: z.enum(['percent', 'fixed']), value: z.number() })).optional(),
  }),
  outputSchema: z.object({ success: z.boolean(), branch: z.any() }),
  execute: async ({ input }) => {
    // Logo / cover photo / delivery fee aren't schema fields on Branches, so — like
    // businessSettings.customFields elsewhere in this app — they live in a small JSON blob.
    const branding = JSON.stringify({
      logoUrl: (input.logoUrl || '').trim(),
      coverPhotoUrl: (input.coverPhotoUrl || '').trim(),
      deliveryFee: input.deliveryFee ?? 199,
    });

    const record: Record<string, unknown> = {
      branchName: input.branchName,
      address: input.address || null,
      phone: input.phone || null,
      taxId: input.taxId || null,
      customFields: branding,
      plusCode: input.plusCode || null,
      coordinates: input.coordinates || null,
    };
    if (input.commissions) record.commissionRates = JSON.stringify(input.commissions.filter(c => c.name.trim()));
    if (input.active !== undefined) record.active = input.active;

    // Only one outlet can be the main outlet at a time.
    if (input.isMainBranch) {
      const { records: all } = await zite.branches.findAll({ limit: 200 });
      for (const b of all) {
        if (b.isMainBranch && b.id !== input.id) {
          await zite.branches.update({ id: b.id, record: { isMainBranch: false } });
        }
      }
      record.isMainBranch = true;
    } else if (input.isMainBranch === false) {
      record.isMainBranch = false;
    }

    if (input.id) {
      const updated = await zite.branches.update({ id: input.id, record });
      return { success: true, branch: updated };
    }

    record.active = record.active ?? true;
    const created = await zite.branches.create({ record });
    return { success: true, branch: created };
  },
});
