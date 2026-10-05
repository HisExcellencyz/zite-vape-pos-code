import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { assertCan } from '../lib/permissions';

export default createEndpoint({
  description: 'Applies deductions such as commissions to one or more sales',
  authenticated: true,
  inputSchema: z.object({
    saleIds: z.array(z.string()).min(1),
    deductions: z.array(z.object({ name: z.string(), type: z.enum(['percent', 'fixed']), value: z.number() })),
    mode: z.enum(['add', 'replace']),
  }),
  outputSchema: z.object({ updated: z.number() }),
  execute: async ({ input, context }) => {
    await assertCan(context.user.id, 'income', 'edit');
    let updated = 0;
    for (const id of input.saleIds) {
      const sale = await zite.sales.findOne({ id });
      if (!sale) continue;
      const base = sale.total || 0;
      let existing: { name: string; amount: number }[] = [];
      if (input.mode === 'add') {
        try { existing = sale.deductionDetails ? JSON.parse(sale.deductionDetails) : []; } catch {}
      }
      const added = input.deductions.map(d => ({
        name: d.name,
        amount: Math.round((d.type === 'percent' ? (base * d.value) / 100 : d.value) * 100) / 100,
      }));
      const merged = [...existing.filter(e => !added.some(a => a.name === e.name)), ...added];
      await zite.sales.update({
        id,
        record: {
          deductions: merged.reduce((s, d) => s + d.amount, 0),
          deductionDetails: merged.length ? JSON.stringify(merged) : null,
        },
      });
      updated++;
    }
    return { updated };
  },
});
