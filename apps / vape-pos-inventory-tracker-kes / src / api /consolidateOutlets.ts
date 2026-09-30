import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

// Every table that carries a "branch" link, and the client used to read/write it.
const BRANCH_TABLES = [
  { key: 'products', client: () => zite.products },
  { key: 'sales', client: () => zite.sales },
  { key: 'purchases', client: () => zite.purchases },
  { key: 'purchaseOrders', client: () => zite.purchaseOrders },
  { key: 'otherExpenses', client: () => zite.otherExpenses },
  { key: 'otherIncome', client: () => zite.otherIncome },
  { key: 'supplierDeposits', client: () => zite.supplierDeposits },
] as const;

export default createEndpoint({
  description: 'One-time migration: move every branch-linked record onto a single named outlet (creating it if needed), and reset every other outlet to a blank, unused state',
  authenticated: true,
  inputSchema: z.object({
    mainOutletName: z.string().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    branchId: z.string(),
    moved: z.record(z.number()),
    resetOutlets: z.number(),
  }),
  execute: async ({ input }) => {
    const targetName = (input.mainOutletName || 'Uptown Vapes').trim();

    const { records: branches } = await zite.branches.findAll({ limit: 200 });
    let target = branches.find(b => (b.branchName || '').trim().toLowerCase() === targetName.toLowerCase());

    if (!target) {
      target = await zite.branches.create({
        record: { branchName: targetName, isMainBranch: true, active: true, customFields: JSON.stringify({}) },
      });
    } else if (!target.isMainBranch) {
      await zite.branches.update({ id: target.id, record: { isMainBranch: true } });
    }
    const targetId = target.id;

    // Re-point every branch-linked record at the target outlet.
    const moved: Record<string, number> = {};
    for (const t of BRANCH_TABLES) {
      const client = t.client();
      const { records } = await client.findAll({ limit: 2000 });
      let count = 0;
      for (const r of records as any[]) {
        const current = Array.isArray(r.branch) ? r.branch[0] : r.branch;
        if (current !== targetId) {
          await client.update({ id: r.id, record: { branch: targetId } });
          count++;
        }
      }
      moved[t.key] = count;
    }

    // Reset every other outlet to a blank, freshly-created-looking state.
    let resetOutlets = 0;
    for (const b of branches) {
      if (b.id === targetId) continue;
      await zite.branches.update({
        id: b.id,
        record: {
          branchName: 'New Outlet',
          address: null,
          phone: null,
          taxId: null,
          plusCode: null,
          coordinates: null,
          customFields: JSON.stringify({}),
          isMainBranch: false,
          active: true,
        },
      });
      resetOutlets++;
    }

    return { success: true, branchId: targetId, moved, resetOutlets };
  },
});
