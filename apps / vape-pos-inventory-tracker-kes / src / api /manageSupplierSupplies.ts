import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { assertCan } from '../lib/permissions';

// The products and categories each supplier supplies are kept in the app settings record
// (customFields.supplierSupplies = { [supplierId]: { productIds, categoryIds } }), like bills, riders and storages.

export default createEndpoint({
  description: 'Get or save the products and categories a supplier supplies. Used by the LPO form to list the supplier\'s products.',
  authenticated: true,
  inputSchema: z.object({
    action: z.enum(['get', 'save']),
    supplierId: z.string(),
    productIds: z.array(z.string()).optional(),
    categoryIds: z.array(z.string()).optional(),
  }),
  outputSchema: z.object({ productIds: z.array(z.string()), categoryIds: z.array(z.string()) }),
  execute: async ({ input, context }) => {
    let settings = await zite.businessSettings.findOne({});
    let cfg: any = {};
    try { if (settings?.customFields) cfg = JSON.parse(settings.customFields); } catch {}
    const all: Record<string, { productIds?: string[]; categoryIds?: string[] }> =
      cfg.supplierSupplies && typeof cfg.supplierSupplies === 'object' ? cfg.supplierSupplies : {};

    if (input.action === 'save') {
      await assertCan(context.user.id, 'suppliers', 'edit');
      all[input.supplierId] = {
        productIds: Array.from(new Set(input.productIds || [])),
        categoryIds: Array.from(new Set(input.categoryIds || [])),
      };
      cfg.supplierSupplies = all;
      const customFields = JSON.stringify(cfg);
      if (settings) await zite.businessSettings.update({ id: settings.id, record: { customFields } });
      else settings = await zite.businessSettings.create({ record: { businessName: 'Uptown Vapes', customFields } });
    }

    const entry = all[input.supplierId] || {};
    return {
      productIds: Array.isArray(entry.productIds) ? entry.productIds : [],
      categoryIds: Array.isArray(entry.categoryIds) ? entry.categoryIds : [],
    };
  },
});
