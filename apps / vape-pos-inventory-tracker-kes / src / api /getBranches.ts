import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

type Item = { name: string; type: 'percent' | 'fixed'; value: number; enabled?: boolean };

// Every outlet carries these three deductions, in this order. If an outlet (or any other outlet)
// already has one of them, its existing amount is copied; otherwise these defaults are used.
const DEFAULT_DEDUCTIONS: Item[] = [
  { name: 'Glovo', type: 'percent', value: 11.6, enabled: true },
  { name: 'Rider Fee', type: 'fixed', value: 340, enabled: true },
  { name: 'Promo', type: 'fixed', value: 70, enabled: false },
];

const norm = (s?: string) => (s || '').trim().toLowerCase();

function parseList(raw?: string | null): Item[] {
  try {
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export default createEndpoint({
  description: 'List outlets/branches, each with its own independent branding (logo, cover photo), incomes & revenues (first = delivery fee) and deductions',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.object({ branches: z.array(z.any()) }),
  execute: async () => {
    const { records } = await zite.branches.findAll({ limit: 200 });

    // Template for the standard deductions: the first outlet that already has each one wins.
    const template = DEFAULT_DEDUCTIONS.map(def => {
      for (const b of records) {
        const found = parseList(b.commissionRates).find(c => norm(c.name) === norm(def.name));
        if (found) return { ...found };
      }
      return { ...def };
    });

    // Glovo, Rider Fee and Promo first (the outlet's own amounts kept), then any other deductions it has.
    const withStandard = (existing: Item[]): Item[] => {
      const standard = template.map(t => existing.find(c => norm(c.name) === norm(t.name)) || { ...t });
      const rest = existing.filter(c => !template.some(t => norm(t.name) === norm(c.name)));
      return [...standard, ...rest];
    };

    const branches = [];
    for (const b of records) {
      let branding: any = {};
      try { branding = b.customFields ? JSON.parse(b.customFields) : {}; } catch {}
      const fee = Number(branding.deliveryFee);
      const legacyFee = branding.deliveryFee !== undefined && Number.isFinite(fee) ? fee : 199;
      // Outlets saved before "Incomes & Revenues" existed only had a delivery fee number:
      // show it as the first income, switched on (as it always was).
      const incomes: Item[] = Array.isArray(branding.incomes)
        ? branding.incomes
        : [{ name: 'Delivery Fee', type: 'fixed', value: legacyFee, enabled: true }];

      let commissions = parseList(b.commissionRates);

      // One-time: add the standard deductions to outlets that don't have them yet.
      // After that the outlet's list is its own (a deduction removed later stays removed).
      if (!branding.deductionsSeeded) {
        commissions = withStandard(commissions);
        try {
          await zite.branches.update({
            id: b.id,
            record: {
              commissionRates: JSON.stringify(commissions),
              customFields: JSON.stringify({ ...branding, deductionsSeeded: true }),
            },
          });
        } catch {}
      }

      branches.push({
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
        commissions,
      });
    }

    // Every business needs at least one outlet to select — create a default
    // "Main Outlet" the first time this is called on a fresh installation.
    if (branches.length === 0) {
      const defaultIncomes: Item[] = [{ name: 'Delivery Fee', type: 'fixed', value: 199, enabled: true }];
      const created = await zite.branches.create({
        record: {
          branchName: 'Main Outlet',
          isMainBranch: true,
          active: true,
          customFields: JSON.stringify({ deliveryFee: 199, incomes: defaultIncomes, deductionsSeeded: true }),
          commissionRates: JSON.stringify(DEFAULT_DEDUCTIONS),
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
        commissions: DEFAULT_DEDUCTIONS,
      });
    }

    return { branches };
  },
});
