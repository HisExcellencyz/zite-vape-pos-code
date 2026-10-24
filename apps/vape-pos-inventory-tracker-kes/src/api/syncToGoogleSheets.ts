import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { integrations } from 'zitejs/integrations';
import { mergeIntoTabs } from '../lib/sheetArchive';

const SHEET_ID = '1bCRujv1eQXslPcZ7-yRWC4ExG75SSBri39b_-BEbDqg';
const RETENTION_DAYS = 90;

export default createEndpoint({
  description: 'Archives every table into the same Google Sheet tabs (updating existing rows, adding new ones), then removes transactions older than 3 months',
  authenticated: true,
  inputSchema: z.object({ webhookUrl: z.string().optional() }),
  outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  execute: async () => {
    const [branches, products, customers, suppliers, sales, saleItems, purchases, expenses, income] = await Promise.all([
      zite.branches.findAll({ limit: 2000 }),
      zite.products.findAll({ limit: 2000 }),
      zite.customers.findAll({ limit: 2000 }),
      zite.suppliers.findAll({ limit: 2000 }),
      zite.sales.findAll({ limit: 2000 }),
      zite.saleItems.findAll({ limit: 2000 }),
      zite.purchases.findAll({ limit: 2000 }),
      zite.otherExpenses.findAll({ limit: 2000 }),
      zite.otherIncome.findAll({ limit: 2000 }),
    ]);
    const outletName = new Map(branches.records.map(b => [b.id, b.branchName || '']));
    const outletOf = (r: any) => {
      const ids = Array.isArray(r.branch) ? r.branch : r.branch ? [r.branch] : [];
      return ids.map((id: string) => outletName.get(id) || id).join(', ');
    };
    const withOutlet = (rows: any[]) => rows.map(r => ({ Outlet: outletOf(r), ...r }));

    const tables: Record<string, any[]> = {
      Products: products.records, Customers: customers.records, Suppliers: suppliers.records,
      Sales: sales.records, 'Sale Items': saleItems.records, Purchases: purchases.records,
      Expenses: expenses.records, 'Other Income': income.records, Outlets: branches.records,
    };

    // Merge into the same tabs every time: rows are matched by record id, so history builds up
    const { accessToken } = await integrations.get('googlesheets');
    const tabs = Object.fromEntries(Object.entries(tables).map(([t, rows]) => [t, withOutlet(rows)]));
    const res = await mergeIntoTabs(accessToken, SHEET_ID, tabs, 'id');

    // Remove transactions older than 3 months — they are now safely in the sheet
    const cutoff = Date.now() - RETENTION_DAYS * 86400000;
    const old = (d?: string) => !!d && new Date(d).getTime() < cutoff;
    const oldSales = sales.records.filter(s => old(s.saleDate));
    const oldSaleIds = new Set(oldSales.map(s => s.id));
    const oldItems = saleItems.records.filter((i: any) => {
      const sid = Array.isArray(i.sale) ? i.sale[0] : i.sale;
      return sid && oldSaleIds.has(sid);
    });
    const del = async (rows: { id: string }[], fn: (id: string) => Promise<unknown>) => { for (const r of rows) await fn(r.id); };
    await del(oldItems, id => zite.saleItems.delete({ id }));
    await del(oldSales, id => zite.sales.delete({ id }));
    const oldPurchases = purchases.records.filter(p => old(p.purchaseDate));
    await del(oldPurchases, id => zite.purchases.delete({ id }));
    const oldExpenses = expenses.records.filter(e => old(e.expenseDate));
    await del(oldExpenses, id => zite.otherExpenses.delete({ id }));
    const oldIncome = income.records.filter(i => old(i.incomeDate));
    await del(oldIncome, id => zite.otherIncome.delete({ id }));

    const removed = oldSales.length + oldPurchases.length + oldExpenses.length + oldIncome.length;
    return {
      success: true,
      message: `Archived to Google Sheets: ${res.added} new and ${res.updated} updated rows (${res.kept} older rows kept). Removed ${removed} transactions older than 3 months from the app.`,
    };
  },
});
