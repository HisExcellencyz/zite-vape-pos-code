import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

/**
 * There is no native Google Sheets connector configured for this app (see
 * zite.config.json's "integrations" — only email and googlemaps are set up).
 * So this does a one-way push of a JSON snapshot to a webhook URL the person
 * supplies, which is meant to be a Google Apps Script "Web App" bound to
 * their own Sheet:
 *
 *   1. In the target Google Sheet: Extensions > Apps Script.
 *   2. Paste a doPost(e) function that JSON.parses(e.postData.contents) and
 *      appends rows to the sheet for whichever keys it wants (products,
 *      customers, sales, ...).
 *   3. Deploy > New deployment > Web app, access "Anyone", copy the URL.
 *   4. Paste that URL into Settings > Integrations here.
 *
 * This makes an outbound POST from the backend; if this Zite environment
 * blocks outbound fetch calls, this call will fail and should be reported.
 */
export default createEndpoint({
  description: 'One-way export of key tables to a Google Sheets webhook (Apps Script Web App)',
  authenticated: true,
  inputSchema: z.object({
    webhookUrl: z.string().optional(),
  }),
  outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  execute: async ({ input }) => {
    let url = input.webhookUrl;
    if (!url) {
      const settings = await zite.businessSettings.findOne({});
      let cfg: any = {};
      try { cfg = settings?.customFields ? JSON.parse(settings.customFields) : {}; } catch {}
      url = cfg.googleSheetsWebhookUrl;
    }
    if (!url) {
      throw new Error('No Google Sheets webhook URL configured. Add one in Settings > Integrations.');
    }

    const [products, customers, suppliers, sales, purchases, expenses, income] = await Promise.all([
      zite.products.findAll({ limit: 2000 }),
      zite.customers.findAll({ limit: 2000 }),
      zite.suppliers.findAll({ limit: 2000 }),
      zite.sales.findAll({ limit: 2000 }),
      zite.purchases.findAll({ limit: 2000 }),
      zite.otherExpenses.findAll({ limit: 2000 }),
      zite.otherIncome.findAll({ limit: 2000 }),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      products: products.records,
      customers: customers.records,
      suppliers: suppliers.records,
      sales: sales.records,
      purchases: purchases.records,
      otherExpenses: expenses.records,
      otherIncome: income.records,
    };

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e: any) {
      throw new Error(`Could not reach the webhook URL: ${e.message || 'network error'}`);
    }

    if (!resp.ok) {
      throw new Error(`The webhook responded with an error (HTTP ${resp.status}). Check the Apps Script deployment.`);
    }

    const totalRows = products.records.length + customers.records.length + suppliers.records.length
      + sales.records.length + purchases.records.length + expenses.records.length + income.records.length;

    return { success: true, message: `Sent ${totalRows} records to Google Sheets.` };
  },
});
