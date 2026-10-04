import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

const itemSchema = z.object({
  name: z.string(),
  type: z.enum(['percent', 'fixed']),
  value: z.number(),
  enabled: z.boolean().optional(),
});

export default createEndpoint({
  description: 'Create or update an outlet/branch, including its own logo, cover photo, incomes & revenues (first = delivery fee) and deductions',
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
    incomes: z.array(itemSchema).optional(),
    commissions: z.array(itemSchema).optional(),
  }),
  outputSchema: z.object({ success: z.boolean(), branch: z.any() }),
  execute: async ({ input }) => {
    // If the caller didn't send incomes, keep the ones already stored for this outlet.
    let incomes: any[] | undefined = input.incomes?.filter(c => c.name.trim()).map(c => ({ ...c, name: c.name.trim() }));
    if (!incomes && input.id) {
      const existing = await zite.branches.findOne({ id: input.id });
      try {
        const old = existing?.customFields ? JSON.parse(existing.customFields) : {};
        if (Array.isArray(old.incomes)) incomes = old.incomes;
      } catch {}
    }

    // The first income is the Delivery Fee; its fixed amount is also kept in `deliveryFee` for older code.
    const first = incomes?.[0];
    const compatFee = first && first.type === 'fixed' ? first.value : (input.deliveryFee ?? 199);

    // Logo / cover photo / incomes aren't schema fields on Branches, so — like
    // businessSettings.customFields elsewhere in this app — they live in a small JSON blob.
    const branding = JSON.stringify({
      logoUrl: (input.logoUrl || '').trim(),
      coverPhotoUrl: (input.coverPhotoUrl || '').trim(),
      deliveryFee: compatFee,
      ...(incomes ? { incomes } : {}),
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
