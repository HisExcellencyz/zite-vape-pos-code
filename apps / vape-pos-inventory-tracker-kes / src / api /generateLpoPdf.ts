import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { ZitePdf } from 'zitejs/pdf';

export default createEndpoint({
  description: 'Generate a PDF for a purchase order (LPO)',
  authenticated: true,
  inputSchema: z.object({
    orderId: z.string(),
    branded: z.boolean().optional(),
  }),
  outputSchema: z.object({ url: z.string() }),
  execute: async ({ input }) => {
    const order = await zite.purchaseOrders.findOne({ id: input.orderId });
    if (!order) throw new Error('Order not found');

    const branded = input.branded !== false;

    let supplierName = 'N/A';
    if (order.supplier?.[0]) {
      const s = await zite.suppliers.findOne({ id: order.supplier[0] });
      if (s) supplierName = s.supplierName || 'N/A';
    }

    let branchName = '';
    if (order.branch?.[0]) {
      const b = await zite.branches.findOne({ id: order.branch[0] });
      if (b) branchName = b.branchName || '';
    }

    const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const safeNum = (n: unknown) => { const v = Number(n); return Number.isFinite(v) ? v : 0; };

    let items: any[] = [];
    try { items = JSON.parse(order.itemsJson || '[]'); } catch {}

    const total = items.reduce((s: number, i: any) => s + safeNum(i.unitPrice) * safeNum(i.quantity), 0);

    // Theme colors
    const accent = '#2b7de9';      // --primary hsl(210 85% 58%)
    const accentLight = '#e8f1fd';  // light tint
    const gold = '#e8a308';         // --secondary hsl(45 93% 52%)

    const rowsHtml = items.map((i: any, idx: number) => {
      const qty = safeNum(i.quantity);
      const price = safeNum(i.unitPrice);
      return `<tr>
        <td>${idx + 1}</td>
        <td>${esc(i.productName)}</td>
        <td>${esc(i.sku || '-')}</td>
        <td class="num">${qty}</td>
        <td class="num">KES ${price.toLocaleString()}</td>
        <td class="num">KES ${(qty * price).toLocaleString()}</td>
        ${branded ? `<td class="verify">${i.verified ? '✓ ' + safeNum(i.verifiedQty) : ''}</td>` : ''}
      </tr>`;
    }).join('');

    const fmtDate = (d: string | null | undefined) => {
      if (!d) return '-';
      try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return d; }
    };

    const headerHtml = branded ? `
      <div class="header">
        <div>
          <h1>UPTOWN VAPES</h1>
          <div style="font-size:9pt;color:#888;">Vape | Enjoy | Repeat</div>
        </div>
        <div style="text-align:right;">
          <div class="lpo">${esc(order.lpoNumber)}</div>
          <div style="font-size:9pt;color:#888;">Local Purchase Order</div>
        </div>
      </div>` : `
      <div class="header header-plain">
        <div>
          <div class="lpo">${esc(order.lpoNumber)}</div>
          <div style="font-size:9pt;color:#888;">Local Purchase Order</div>
        </div>
      </div>`;

    const footerHtml = branded
      ? `<div class="footer">Uptown Vapes — Generated on ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</div>`
      : `<div class="footer">Generated on ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</div>`;

    const html = `<!doctype html>
<html>
<head><meta charset="utf-8" />
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  @page { size: a4; margin: 0.6in 0.7in; }
  body { font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a2e; font-size: 10pt; background: white; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; border-bottom: 3px solid ${accent}; padding-bottom: 16px; }
  .header-plain { border-bottom-color: #ccc; }
  .header h1 { font-size: 22pt; margin: 0; color: ${accent}; letter-spacing: -0.02em; font-weight: 800; }
  .header .lpo { font-size: 14pt; color: #333; font-weight: 700; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 32px; margin-bottom: 20px; font-size: 9.5pt; }
  .meta dt { color: #666; text-transform: uppercase; font-size: 8pt; letter-spacing: 0.05em; font-weight: 500; }
  .meta dd { margin: 0; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; margin-top: 10px; }
  th { text-align: left; font-size: 8.5pt; font-weight: 700; color: white; background: ${branded ? accent : '#555'}; padding: 8px 10px; }
  th.num, td.num { text-align: right; }
  th.verify, td.verify { text-align: center; width: 80px; }
  td { padding: 7px 10px; border-bottom: 1px solid #e5e5e5; font-size: 9.5pt; }
  tr:nth-child(even) td { background: ${branded ? accentLight : '#f8f8f8'}; }
  tfoot td { border-top: 2px solid ${branded ? accent : '#555'}; font-weight: 700; font-size: 11pt; padding-top: 10px; }
  .footer { margin-top: 32px; font-size: 8.5pt; color: #888; text-align: center; border-top: 1px solid #ddd; padding-top: 12px; }
  .notes { margin-top: 16px; padding: 10px; background: ${branded ? accentLight : '#f5f5f5'}; border-radius: 6px; font-size: 9pt; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 8pt; font-weight: 600; background: ${branded ? gold : '#999'}; color: white; }
</style>
</head>
<body>
  ${headerHtml}

  <dl class="meta">
    <div><dt>Supplier</dt><dd>${esc(supplierName)}</dd></div>
    <div><dt>Order Date</dt><dd>${fmtDate(order.orderDate)}</dd></div>
    ${branchName ? `<div><dt>Branch</dt><dd>${esc(branchName)}</dd></div>` : ''}
    <div><dt>Expected Delivery</dt><dd>${fmtDate(order.expectedDeliveryDate)}</dd></div>
    <div><dt>Status</dt><dd><span class="badge">${esc(order.status || 'Draft')}</span></dd></div>
  </dl>

  <table>
    <thead><tr><th>#</th><th>Product</th><th>SKU</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Amount</th>${branded ? '<th class="verify">Verified</th>' : ''}</tr></thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot><tr><td colspan="5" style="text-align:right;">Total</td><td class="num">KES ${total.toLocaleString()}</td>${branded ? '<td></td>' : ''}</tr></tfoot>
  </table>

  ${order.notes ? `<div class="notes"><strong>Notes:</strong> ${esc(order.notes)}</div>` : ''}

  ${footerHtml}
</body>
</html>`;

    const { url } = await ZitePdf.renderHtml({
      html,
      filename: `${order.lpoNumber || 'LPO'}${branded ? '' : '-unbranded'}.pdf`,
    });

    return { url };
  },
});
