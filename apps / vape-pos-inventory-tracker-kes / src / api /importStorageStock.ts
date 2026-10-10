import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getAccess } from '../lib/permissions';
import { ensureStorages } from '../lib/storages';
import { OFFICE_ID, qtyIn } from '../lib/storageMath';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const normRow = (r: Record<string, string>) => {
  const o: Record<string, string> = {};
  for (const [k, v] of Object.entries(r)) o[norm(k)] = String(v ?? '').trim();
  return o;
};

export default createEndpoint({
  description: 'Owner and Admin only: import stock levels per storage from CSV rows (Storage, Product SKU, Quantity). Each row sets the quantity held in that storage; the difference is added to (or taken from) the product\'s total stock, so the Office stays the remainder.',
  authenticated: true,
  inputSchema: z.object({
    rows: z.array(z.record(z.string())),
  }),
  outputSchema: z.object({ imported: z.number(), updated: z.number(), skipped: z.number(), errors: z.array(z.string()) }),
  execute: async ({ input, context }) => {
    if (input.rows.length > 1500) throw new Error('Too many rows. Import up to 1,500 rows at a time.');
    const access = await getAccess(context.user.id);
    if (!(access.isOwner || access.isAdmin)) throw new Error('Only the Owner and Admins can change stock levels');

    const { settings, cfg, storages, stock } = await ensureStorages();
    const storageByName = new Map(storages.map(s => [s.name.trim().toLowerCase(), s]));
    const { records: products } = await zite.products.findAll({ limit: 2000 });
    const bySku = new Map(products.map(p => [(p.sku || '').trim().toLowerCase(), p]));
    const totals = new Map<string, number>(products.map(p => [p.id, p.stockQuantity || 0]));

    const errors: string[] = [];
    let skipped = 0;
    // Last row wins when the same storage + product appears twice.
    const targets = new Map<string, { storageId: string; productId: string; qty: number }>();

    input.rows.forEach((raw, i) => {
      const r = normRow(raw);
      const line = i + 2;
      const storageName = r['storage'] || r['storagename'] || '';
      const sku = r['productsku'] || r['sku'] || '';
      const qtyStr = r['quantity'] || r['qty'] || '';
      const st = storageByName.get(storageName.toLowerCase());
      if (!st) { skipped++; errors.push(`Row ${line}: storage "${storageName}" not found`); return; }
      const p = bySku.get(sku.toLowerCase());
      if (!p) { skipped++; errors.push(`Row ${line}: product SKU "${sku}" not found`); return; }
      const qty = Math.floor(Number(qtyStr.replace(/,/g, '')));
      if (qtyStr === '' || !Number.isFinite(qty) || qty < 0) { skipped++; errors.push(`Row ${line}: invalid quantity`); return; }
      targets.set(`${st.id}|${p.id}`, { storageId: st.id, productId: p.id, qty });
    });

    let updated = 0;
    for (const t of targets.values()) {
      const total = totals.get(t.productId) || 0;
      const current = qtyIn(t.storageId, t.productId, total, stock);
      const delta = t.qty - current;
      if (delta === 0) { skipped++; continue; }
      if (t.storageId !== OFFICE_ID) {
        stock[t.storageId] = stock[t.storageId] || {};
        if (t.qty > 0) stock[t.storageId][t.productId] = t.qty;
        else delete stock[t.storageId][t.productId];
      }
      const newTotal = Math.max(0, total + delta);
      totals.set(t.productId, newTotal);
      await zite.products.update({ id: t.productId, record: { stockQuantity: newTotal } });
      updated++;
    }

    if (updated > 0) {
      cfg.storageStock = stock;
      const customFields = JSON.stringify(cfg);
      const s = settings || (await zite.businessSettings.findOne({}));
      if (s) await zite.businessSettings.update({ id: s.id, record: { customFields } });
      else await zite.businessSettings.create({ record: { businessName: 'Uptown Vapes', customFields } });
    }

    return { imported: 0, updated, skipped, errors: errors.slice(0, 50) };
  },
});
