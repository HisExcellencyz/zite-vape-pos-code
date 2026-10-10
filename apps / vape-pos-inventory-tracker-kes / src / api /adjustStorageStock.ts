import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getAccess } from '../lib/permissions';
import { ensureStorages } from '../lib/storages';
import { OFFICE_ID, qtyIn } from '../lib/storageMath';

export default createEndpoint({
  description: 'Owner and Admin only: set the stock level of one or more products in a storage. The difference is added to (or taken from) the product\'s total stock, so the Office stays the remainder.',
  authenticated: true,
  inputSchema: z.object({
    storageId: z.string(),
    items: z.array(z.object({ productId: z.string(), quantity: z.number().min(0) })).min(1),
  }),
  outputSchema: z.object({ success: z.boolean(), adjusted: z.number() }),
  execute: async ({ input, context }) => {
    const access = await getAccess(context.user.id);
    if (!(access.isOwner || access.isAdmin)) throw new Error('Only the Owner and Admins can adjust stock levels');

    const { settings, cfg, storages, stock } = await ensureStorages();
    const st = storages.find(s => s.id === input.storageId);
    if (!st) throw new Error('Storage not found');

    let adjusted = 0;
    for (const it of input.items) {
      const target = Math.floor(it.quantity);
      if (!(target >= 0)) throw new Error('Quantities cannot be negative');
      const product = await zite.products.findOne({ id: it.productId });
      if (!product) continue;
      const total = product.stockQuantity || 0;
      const current = qtyIn(st.id, it.productId, total, stock);
      const delta = target - current;
      if (delta === 0) continue;

      // The Office is derived (total minus the other storages), so only the total changes for it.
      if (st.id !== OFFICE_ID) {
        stock[st.id] = stock[st.id] || {};
        if (target > 0) stock[st.id][it.productId] = target;
        else delete stock[st.id][it.productId];
      }
      await zite.products.update({ id: it.productId, record: { stockQuantity: Math.max(0, total + delta) } });
      adjusted++;
    }

    if (adjusted > 0) {
      cfg.storageStock = stock;
      const customFields = JSON.stringify(cfg);
      const s = settings || (await zite.businessSettings.findOne({}));
      if (s) await zite.businessSettings.update({ id: s.id, record: { customFields } });
      else await zite.businessSettings.create({ record: { businessName: 'Uptown Vapes', customFields } });
    }
    return { success: true, adjusted };
  },
});
