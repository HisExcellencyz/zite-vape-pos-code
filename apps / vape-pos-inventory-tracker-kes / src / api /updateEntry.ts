import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getAccess } from '../lib/permissions';
import { resolveDateChange, moveSaleDate } from '../lib/entryDates';

const SALE_SUFFIX = /\s-\sSale\s#\d+$/;

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
    deductions: z.array(z.object({ name: z.string().min(1), amount: z.number().min(0) })).optional(),
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
