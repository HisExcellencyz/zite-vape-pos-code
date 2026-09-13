import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Export a purchase order as CSV/Excel-compatible data',
  authenticated: true,
  inputSchema: z.object({ orderId: z.string() }),
  outputSchema: z.object({ csv: z.string(), filename: z.string() }),
  execute: async ({ input }) => {
    const order = await zite.purchaseOrders.findOne({ id: input.orderId });
    if (!order) throw new Error('Order not found');

    let supplierName = 'N/A';
    if (order.supplier?.[0]) {
      const s = await zite.suppliers.findOne({ id: order.supplier[0] });
      if (s) supplierName = s.supplierName || 'N/A';
    }

    let items: any[] = [];
    try { items = JSON.parse(order.itemsJson || '[]'); } catch {}

    const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    const lines: string[] = [];
    lines.push(`${esc(order.lpoNumber || '')} - Purchase Order`);
    lines.push(`Supplier,${esc(supplierName)}`);
    lines.push(`Order Date,${esc(order.orderDate || '')}`);
    lines.push(`Expected Delivery,${esc(order.expectedDeliveryDate || '')}`);
    lines.push(`Status,${esc(order.status || 'draft')}`);
    lines.push('');
    lines.push('#,Product,SKU,Quantity,Unit Price (KES),Amount (KES),Verified,Verified Qty');

    items.forEach((item: any, idx: number) => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unitPrice) || 0;
      lines.push(
        `${idx + 1},${esc(item.productName || '')},${esc(item.sku || '')},${qty},${price},${qty * price},${item.verified ? 'Yes' : 'No'},${item.verifiedQty || 0}`
      );
    });

    const total = items.reduce((s: number, i: any) => s + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0);
    lines.push(`,,,,Total,${total},,`);

    return { csv: lines.join('\n'), filename: `${order.lpoNumber || 'LPO'}.csv` };
  },
});
