import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { Email } from 'zitejs/email';

function toCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [headers.join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\n');
}

const pre = (label: string, csv: string) => `
  <h3 style="margin-bottom:4px;">${label}</h3>
  <pre style="white-space:pre-wrap; font-size:11px; background:#f5f5f5; color:#111; padding:10px; border-radius:6px; max-height:400px; overflow:auto;">${csv.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>
`;

export default createEndpoint({
  description: 'Monthly archival: emails CSV snapshots of sales, purchases, other expenses, other income, and current stock',
  authenticated: true,
  // Runs at 02:00 on the 1st of every month. NOTE: this cron syntax is a
  // best guess at this Zite runtime's schedule format — if the endpoint
  // doesn't fire monthly once deployed, set/confirm the schedule from
  // Zite's own endpoint settings screen instead of relying on this field.
  schedule: { cron: '0 2 1 * *' } as any,
  inputSchema: z.object({
    recipientEmail: z.string().optional(),
  }),
  outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  execute: async ({ input }) => {
    const settings = await zite.businessSettings.findOne({});
    let cfg: any = {};
    try { cfg = settings?.customFields ? JSON.parse(settings.customFields) : {}; } catch {}
    const to = input.recipientEmail || cfg.archivalEmail || settings?.email;
    if (!to) {
      throw new Error('No archival recipient email configured. Add one in Settings > Integrations, or pass recipientEmail.');
    }

    const [sales, purchases, expenses, income, products] = await Promise.all([
      zite.sales.findAll({ limit: 2000 }),
      zite.purchases.findAll({ limit: 2000 }),
      zite.otherExpenses.findAll({ limit: 2000 }),
      zite.otherIncome.findAll({ limit: 2000 }),
      zite.products.findAll({ limit: 2000 }),
    ]);

    const period = new Date().toISOString().slice(0, 7);

    const salesCsv = toCsv(
      ['id', 'saleNumber', 'saleDate', 'paymentMethod', 'subtotal', 'taxAmount', 'discount', 'total', 'status'],
      sales.records as any,
    );
    const purchasesCsv = toCsv(
      ['id', 'purchaseNumber', 'purchaseDate', 'total', 'paymentType', 'notes'],
      purchases.records as any,
    );
    const expensesCsv = toCsv(
      ['id', 'expenseNumber', 'expenseDate', 'description', 'amount', 'notes'],
      expenses.records as any,
    );
    const incomeCsv = toCsv(
      ['id', 'incomeNumber', 'incomeDate', 'description', 'amount', 'notes'],
      income.records as any,
    );
    const stockCsv = toCsv(
      ['id', 'productName', 'sku', 'stockQuantity', 'costPrice', 'sellingPrice', 'status'],
      products.records as any,
    );

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 720px; margin: 0 auto;">
        <h2>Monthly Archival — ${period}</h2>
        <p style="color:#555;">Automated snapshot for record-keeping. This does not change any live data.</p>
        ${pre(`Sales (${sales.records.length})`, salesCsv)}
        ${pre(`Purchases (${purchases.records.length})`, purchasesCsv)}
        ${pre(`Other Expenses (${expenses.records.length})`, expensesCsv)}
        ${pre(`Other Income (${income.records.length})`, incomeCsv)}
        ${pre(`Stock levels (${products.records.length})`, stockCsv)}
      </div>
    `;

    // NOTE: the CSVs are embedded inline (as text) rather than attached as
    // files — this Email SDK's documented body blocks only cover type
    // "text". If your Zite plan's Email integration does support real file
    // attachments, tell me the parameter shape and I'll switch this to send
    // proper .csv attachments instead.
    await Email.send({
      to,
      subject: `Monthly Archival — ${period}`,
      body: [{ type: 'text', content: html }],
    });

    return { success: true, message: `Archival sent to ${to} for ${period}.` };
  },
});
