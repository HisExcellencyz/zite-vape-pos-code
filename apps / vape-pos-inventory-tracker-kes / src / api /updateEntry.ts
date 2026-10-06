import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getAccess } from '../lib/permissions';
import { resolveDateChange, moveSaleDate } from '../lib/entryDates';

const SALE_SUFFIX = /\s-\sSale\s#\d+$/;
const riderOf = (notes?: string | null) => /Rider \((?:3PL|Own)\): [^|]+/.exec(notes || '')?.[0]?.trim() || null;
const firstId = (v: any) => (Array.isArray(v) ? v[0] : v) || null;
const round2 = (n: number) => Math.round(n * 100) / 100;

export default createEndpoint({
  description: 'Edit an entry on the Income or Expenses pages (sale, income, purchase, other expense or sale deductions). Changing the date (backdating) is only allowed for the Owner and Admin.',
  authenticated: true,
  inputSchema: z.object({
    kind: z.enum(['sale', 'income', 'purchase', 'expense', 'deduction']),
    id: z.string(),
    /** Calendar day, YYYY-MM-DD. Only honoured for the Owner and Admin when it differs from the current date. */
    date: z.string().optional(),
    description: z.string().optional(),
    amount: z.number().optional(),
    notes: z.string().optional(),
    paymentMethod: z.string().optional(),
    /** kind 'deduction' and kind 'sale': the full list of deductions on the sale (replaces what is there). */
    deductions: z.array(z.object({ name: z.string().min(1), amount: z.number().min(0) })).optional(),
    /**
     * kind 'sale': the full list of revenues (delivery fee and other revenues) on the sale. Rows with an id update that
     * revenue, rows without one are added, and revenues of the sale that are not listed are removed.
     */
    revenues: z.array(z.object({ id: z.string().optional(), name: z.string().min(1), amount: z.number().positive() })).optional(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ input, context }) => {
    const access = await getAccess(context.user.id);
    const need = (areas: string[]) => {
      if (!areas.some(a => access.can(a, 'edit'))) throw new Error('You do not have permission to edit these entries. Ask an administrator to update your role.');
    };

    switch (input.kind) {
      case 'sale': {
        need(['income']);
        const sale = await zite.sales.findOne({ id: input.id });
        if (!sale) throw new Error('Sale not found');
        const newDate = resolveDateChange(input.date, sale.saleDate, access.canBackdate);
        const record: Record<string, unknown> = {};
        if (input.paymentMethod) record.paymentMethod = input.paymentMethod;
        if (input.notes !== undefined) record.notes = input.notes || null;
        if (Object.keys(record).length) await zite.sales.update({ id: input.id, record });

        // Deductions on the sale (pink) — same storage as the Expenses page uses.
        if (input.deductions) {
          const list = input.deductions.map(d => ({ name: d.name.trim(), amount: round2(d.amount) }));
          if (list.some(d => !d.name)) throw new Error('Each deduction needs a name');
          await zite.sales.update({
            id: input.id,
            record: {
              deductions: list.reduce((s, d) => s + d.amount, 0),
              deductionDetails: list.length ? JSON.stringify(list) : null,
            },
          });
        }

        // Revenues on the sale (green) are Other Income entries whose description ends with " - Sale #n".
        if (input.revenues) {
          if (sale.status === 'Voided') throw new Error('Revenues cannot be changed on a voided sale');
          if (sale.saleNumber == null) throw new Error('This sale has no number, so its revenues cannot be linked');
          const suffix = ` - Sale #${sale.saleNumber}`;
          const linked = await zite.sql({
            query: `SELECT id FROM "OtherIncome" WHERE "description" LIKE $1`,
            params: [`%${suffix}`],
          });
          const existingIds = new Set(linked.rows.map(r => String(r.id)));
          const keep = new Set<string>();
          for (const rev of input.revenues) {
            const clean = rev.name.trim().replace(SALE_SUFFIX, '').trim();
            if (!clean) throw new Error('Each revenue needs a name');
            const description = `${/^delivery\s*fee$/i.test(clean) ? 'Delivery fee' : clean}${suffix}`;
            const amount = round2(rev.amount);
            if (rev.id && existingIds.has(rev.id)) {
              keep.add(rev.id);
              await zite.otherIncome.update({ id: rev.id, record: { description, amount } });
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
            }
          }
          for (const id of existingIds) if (!keep.has(id)) await zite.otherIncome.delete({ id });
        }

        // Done last so revenues added above move to the new date together with the rest.
        if (newDate) await moveSaleDate(input.id, sale.saleNumber, newDate);
        break;
      }
      case 'deduction': {
        need(['expenses']);
        const sale = await zite.sales.findOne({ id: input.id });
        if (!sale) throw new Error('Sale not found');
        const newDate = resolveDateChange(input.date, sale.saleDate, access.canBackdate);
        if (input.deductions) {
          const list = input.deductions.map(d => ({ name: d.name.trim(), amount: Math.round(d.amount * 100) / 100 }));
          await zite.sales.update({
            id: input.id,
            record: {
              deductions: list.reduce((s, d) => s + d.amount, 0),
              deductionDetails: list.length ? JSON.stringify(list) : null,
            },
          });
        }
        if (newDate) await moveSaleDate(input.id, sale.saleNumber, newDate);
        break;
      }
      case 'income': {
        need(['income']);
        const row = await zite.otherIncome.findOne({ id: input.id });
        if (!row) throw new Error('Income entry not found');
        const newDate = resolveDateChange(input.date, row.incomeDate, access.canBackdate);
        const record: Record<string, unknown> = {};
        if (input.description !== undefined) {
          let d = input.description.trim();
          if (!d) throw new Error('Description is required');
          // Keep the "- Sale #n" link of revenues that belong to a sale.
          const oldSuffix = SALE_SUFFIX.exec(row.description || '')?.[0];
          if (oldSuffix && !SALE_SUFFIX.test(d)) d += oldSuffix;
          record.description = d;
        }
        if (input.amount !== undefined) {
          if (!(input.amount > 0)) throw new Error('Enter a valid amount');
          record.amount = input.amount;
        }
        if (input.notes !== undefined) record.notes = input.notes || null;
        if (newDate) record.incomeDate = newDate;
        if (Object.keys(record).length) await zite.otherIncome.update({ id: input.id, record });
        break;
      }
      case 'expense': {
        need(['expenses']);
        const row = await zite.otherExpenses.findOne({ id: input.id });
        if (!row) throw new Error('Expense not found');
        const newDate = resolveDateChange(input.date, row.expenseDate, access.canBackdate);
        const record: Record<string, unknown> = {};
        if (input.description !== undefined) {
          if (!input.description.trim()) throw new Error('Description is required');
          record.description = input.description.trim();
        }
        if (input.amount !== undefined) {
          if (!(input.amount > 0)) throw new Error('Enter a valid amount');
          record.amount = input.amount;
        }
        if (input.notes !== undefined) record.notes = input.notes || null;
        if (newDate) record.expenseDate = newDate;
        if (Object.keys(record).length) await zite.otherExpenses.update({ id: input.id, record });
        break;
      }
      case 'purchase': {
        need(['expenses', 'purchases']);
        const row = await zite.purchases.findOne({ id: input.id });
        if (!row) throw new Error('Purchase not found');
        const newDate = resolveDateChange(input.date, row.purchaseDate, access.canBackdate);
        const record: Record<string, unknown> = {};
        if (input.notes !== undefined) record.notes = input.notes || null;
        if (newDate) record.purchaseDate = newDate;
        if (Object.keys(record).length) await zite.purchases.update({ id: input.id, record });
        // A deposit-funded purchase also has a supplier ledger line: keep it on the same date.
        if (newDate && row.purchaseNumber != null) {
          try {
            const tx = await zite.sql({
              query: `SELECT id FROM "SupplierTransactions" WHERE "type" = 'Purchase Deduction' AND ("notes" = $1 OR "notes" LIKE $2)`,
              params: [`Purchase #${row.purchaseNumber}`, `Purchase #${row.purchaseNumber} (%`],
            });
            for (const r of tx.rows) await zite.supplierTransactions.update({ id: String(r.id), record: { transactionDate: newDate } });
          } catch {}
        }
        break;
      }
    }
    return { success: true };
  },
});
