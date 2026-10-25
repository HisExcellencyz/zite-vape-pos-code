import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { TEMPLATE_HEADERS, exportDate, toCsv } from '../lib/exportFormat';

// Same columns as the LPO import template: one row per item, all sharing the LPO Number.
// (The printable purchase order is the PDF download.)
export default createEndpoint({
  description: 'Export a purchase order as CSV in the LPO import template format',
  authenticated: true,
  inputSchema: z.object({ orderId: z.string() }),
  outputSchema: z.object({ csv: z.string(), filename: z.string() }),
  execute: async ({ input }) => {
    const order = await zite.purchaseOrders.findOne({ id: input.orderId });
    if (!order) throw new Error('Order not found');

    const supplierId = Array.isArray(order.supplier) ? order.supplier[0] : order.supplier;
    const supplier = supplierId ? await zite.suppliers.findOne({ id: supplierId }) : null;

    let items: any[] = [];
    try { items = JSON.parse(order.itemsJson || '[]'); } catch {}

    const notes = String(order.notes || '').replace(/\s+/g, ' ').trim();
    const rows = items.map((item, i) => ({
      'LPO Number': order.lpoNumber || '',
      'Supplier Name': supplier?.supplierName || '',
      'Order Date': exportDate(order.orderDate, false),
      'Expected Delivery Date': exportDate(order.expectedDeliveryDate, false),
      'Status': order.status || 'Draft',
      'Product SKU': item.sku || '',
      'Quantity': Number(item.quantity) || 0,
      'Unit Price': Number(item.unitPrice) || 0,
      'Notes': i === 0 ? notes : '',
    }));

    return { csv: toCsv(TEMPLATE_HEADERS.lpos, rows), filename: `${order.lpoNumber || 'LPO'}.csv` };
  },
});
