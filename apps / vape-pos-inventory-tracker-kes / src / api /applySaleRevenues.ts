import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { assertCan } from '../lib/permissions';

const riderOf = (notes?: string | null) => /Rider \((?:3PL|Own)\): [^|]+/.exec(notes || '')?.[0]?.trim() || null;
const firstId = (v: any) => (Array.isArray(v) ? v[0] : v) || null;
const isDeliveryName = (n: string) => /^\s*delivery\s*fee\s*$/i.test(n);

export default createEndpoint({
  description: 'Applies revenues such as the Delivery Fee to one or more sales. Each revenue is recorded as an Other Income entry linked to the sale (same as at POS).',
  authenticated: true,
  inputSchema: z.object({
    saleIds: z.array(z.string()).min(1),
    revenues: z.array(z.object({ name: z.string().min(1), type: z.enum(['percent', 'fixed']), value: z.number().min(0) })),
    mode: z.enum(['add', 'replace']),
  }),
  outputSchema: z.object({ updated: z.number(), created: z.number(), removed: z.number(), skipped: z.number() }),
  execute: async ({ input, context }) => {
    await assertCan(context.user.id, 'income', 'edit');

    let updated = 0, created = 0, removed = 0, skipped = 0;

    for (const id of input.saleIds) {
      const sale = await zite.sales.findOne({ id });
      if (!sale || sale.status === 'Voided' || sale.saleNumber == null) { skipped++; continue; }

      const suffix = ` - Sale #${sale.saleNumber}`;
      const linked = await zite.sql({
        query: `SELECT id, "description" FROM "OtherIncome" WHERE "description" LIKE $1`,
        params: [`%${suffix}`],
      });
      const existing = linked.rows.map(r => ({ id: String(r.id), description: String(r.description || '') }));

      if (input.mode === 'replace') {
        for (const e of existing) { await zite.otherIncome.delete({ id: e.id }); removed++; }
        existing.length = 0;
      }

      const base = sale.total || 0;
      for (const rev of input.revenues) {
        const amount = Math.round((rev.type === 'percent' ? (base * rev.value) / 100 : rev.value) * 100) / 100;
        if (!(amount > 0)) continue;
        // The first revenue of an outlet is the Delivery Fee: stored with the same wording POS uses.
        const description = `${isDeliveryName(rev.name) ? 'Delivery fee' : rev.name.trim()}${suffix}`;
        const match = existing.find(e => e.description.toLowerCase() === description.toLowerCase());
        if (match) {
          await zite.otherIncome.update({ id: match.id, record: { amount } });
          updated++;
        } else {
          await zite.otherIncome.create({
            record: {
              incomeDate: sale.saleDate || new Date().toISOString(),
              description,
              amount,
              branch: firstId(sale.branch),
              notes: riderOf(sale.notes),
              createdBy: context.user.id,
            },
          });
          created++;
        }
      }
    }

    return { updated, created, removed, skipped };
  },
});
