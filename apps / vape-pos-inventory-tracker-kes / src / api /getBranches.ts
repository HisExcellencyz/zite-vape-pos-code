import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'List outlets/branches, each with its own independent branding (logo, cover photo)',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.object({ branches: z.array(z.any()) }),
  execute: async () => {
    const { records } = await zite.branches.findAll({ limit: 200 });

    const branches = records.map(b => {
      let branding: any = {};
      try { branding = b.customFields ? JSON.parse(b.customFields) : {}; } catch {}
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
        commissions: (() => { try { return b.commissionRates ? JSON.parse(b.commissionRates) : []; } catch { return []; } })() as { name: string; type: 'percent' | 'fixed'; value: number }[],
      };
    });

    // Every business needs at least one outlet to select — create a default
    // "Main Outlet" the first time this is called on a fresh installation.
    if (branches.length === 0) {
      const created = await zite.branches.create({
        record: {
          branchName: 'Main Outlet',
          isMainBranch: true,
          active: true,
          customFields: JSON.stringify({}),
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
        commissions: [],
      });
    }

    return { branches };
  },
});
