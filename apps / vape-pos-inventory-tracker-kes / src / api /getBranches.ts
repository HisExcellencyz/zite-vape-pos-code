import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

type Item = { name: string; type: 'percent' | 'fixed'; value: number; enabled?: boolean };

export default createEndpoint({
  description: 'List outlets/branches, each with its own independent branding (logo, cover photo), incomes & revenues (first = delivery fee) and deductions',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.object({ branches: z.array(z.any()) }),
  execute: async () => {
    const { records } = await zite.branches.findAll({ limit: 200 });

    const branches = records.map(b => {
      let branding: any = {};
      try { branding = b.customFields ? JSON.parse(b.customFields) : {}; } catch {}
      const fee = Number(branding.deliveryFee);
      const legacyFee = branding.deliveryFee !== undefined && Number.isFinite(fee) ? fee : 199;
      // Outlets saved before "Incomes & Revenues" existed only had a delivery fee number:
      // show it as the first income, switched on (as it always was).
      const incomes: Item[] = Array.isArray(branding.incomes)
        ? branding.incomes
        : [{ name: 'Delivery Fee', type: 'fixed', value: legacyFee, enabled: true }];
      return {
        id: b.id,
        branchName: b.branchName || 'Outlet',
        address: b.address || '',
        phone: b.phone || '',
        taxId: b.taxId || '',
        isMainBranch: !!b.isMainBranch,
        active: b.active !== false,
        plusCode: b.plusCode || '',
        coordinates: b.coordinates || '',
        logoUrl: branding.logoUrl || '',
        coverPhotoUrl: branding.coverPhotoUrl || '',
        deliveryFee: legacyFee,
        incomes,
        commissions: (() => { try { return b.commissionRates ? JSON.parse(b.commissionRates) : []; } catch { return []; } })() as Item[],
      };
    });

    // Every business needs at least one outlet to select — create a default
    // "Main Outlet" the first time this is called on a fresh installation.
    if (branches.length === 0) {
      const defaultIncomes: Item[] = [{ name: 'Delivery Fee', type: 'fixed', value: 199, enabled: true }];
      const created = await zite.branches.create({
        record: {
          branchName: 'Main Outlet',
          isMainBranch: true,
          active: true,
          customFields: JSON.stringify({ deliveryFee: 199, incomes: defaultIncomes }),
        },
      });
      branches.push({
        id: created.id,
        branchName: created.branchName || 'Main Outlet',
        address: '',
        phone: '',
        taxId: '',
        isMainBranch: true,
        active: true,
        plusCode: '',
        coordinates: '',
        logoUrl: '',
        coverPhotoUrl: '',
        deliveryFee: 199,
        incomes: defaultIncomes,
        commissions: [],
      });
    }

    return { branches };
  },
});
