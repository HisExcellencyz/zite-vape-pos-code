import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

const SHEET_ID = '1bCRujv1eQXslPcZ7-yRWC4ExG75SSBri39b_-BEbDqg';
const API = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`;
const RETENTION_DAYS = 90;

async function gs(path: string, init?: RequestInit) {
  const res = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.ZITE_GOOGLESHEETS_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Google Sheets error (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const cell = (v: unknown) => v == null ? '' : Array.isArray(v) ? v.map(x => typeof x === 'object' ? (x as any).url ?? JSON.stringify(x) : x).join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v);

export default createEndpoint({
  description: 'Archives every table to the connected Google Sheet, then removes transactions older than 3 months',
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

    const tables: Record<string, any[]> = {
      Products: products.records, Customers: customers.records, Suppliers: suppliers.records,
      Sales: sales.records, 'Sale Items': saleItems.records, Purchases: purchases.records,
      Expenses: expenses.records, 'Other Income': income.records, Outlets: branches.records,
    };

    // Make sure a tab exists for each table
    const meta = await gs('?fields=sheets.properties.title');
    const existing = new Set((meta.sheets || []).map((s: any) => s.properties.title));
    const missing = Object.keys(tables).filter(t => !existing.has(t));
    if (missing.length) {
      await gs(':batchUpdate', { method: 'POST', body: JSON.stringify({ requests: missing.map(title => ({ addSheet: { properties: { title } } })) }) });
    }

    // Overwrite each tab with a fresh snapshot (Outlet name column added)
    const data = Object.entries(tables).map(([title, rows]) => {
      const keys = Array.from(new Set(rows.flatMap(r => Object.keys(r))));
      const header = ['Outlet', ...keys];
      return { range: `'${title}'!A1`, values: [header, ...rows.map(r => [outletOf(r), ...keys.map(k => cell(r[k]))])] };
    });
    await gs('/values:batchClear', { method: 'POST', body: JSON.stringify({ ranges: Object.keys(tables).map(t => `'${t}'`) }) });
    await gs('/values:batchUpdate', { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data }) });

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

    const total = Object.values(tables).reduce((s, r) => s + r.length, 0);
    const removed = oldSales.length + oldPurchases.length + oldExpenses.length + oldIncome.length;
    return { success: true, message: `Archived ${total} records to Google Sheets. Removed ${removed} transactions older than 3 months.` };
  },
});
