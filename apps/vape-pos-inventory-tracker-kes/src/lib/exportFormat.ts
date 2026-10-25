// Shared by the browser and the endpoints: exports are written in the same shape
// as the import templates, so an exported file can be edited and imported back.

/** A timestamp as the importers read it: "YYYY-MM-DD HH:mm" in East Africa Time (or the day only). */
export function exportDate(value: unknown, withTime = true): string {
  if (!value) return '';
  const d = new Date(String(value));
  if (isNaN(d.getTime())) return String(value);
  const eat = new Date(d.getTime() + 3 * 3600 * 1000).toISOString();
  return withTime ? `${eat.slice(0, 10)} ${eat.slice(11, 16)}` : eat.slice(0, 10);
}

/** One CSV cell, quoted when it holds a comma, quote or line break. */
export function csvCell(value: unknown): string {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** A CSV file from headers and rows keyed by those headers. */
export function toCsv(headers: string[], rows: Record<string, unknown>[]): string {
  return [headers.join(','), ...rows.map(r => headers.map(h => csvCell(r[h])).join(','))].join('\n') + '\n';
}

/** Columns of each import template. Exports use exactly the same columns, in the same order. */
export const TEMPLATE_HEADERS = {
  products: ['Product Name', 'SKU', 'Cost Price', 'Selling Price', 'Stock Quantity', 'Category', 'Subcategory', 'Image URL'],
  customers: ['Customer Name', 'Phone Number', 'Email', 'Address'],
  suppliers: ['Supplier Name', 'Phone', 'Email', 'Address'],
  storageStock: ['Storage', 'SKU', 'Product Name', 'Quantity'],
  sales: ['Sale Ref', 'Date', 'Customer Name', 'Customer Phone', 'Payment Method', 'Product SKU', 'Quantity', 'Unit Price', 'Discount', 'Notes', 'Sale Number'],
  purchases: ['Purchase Ref', 'Date', 'Supplier Name', 'Payment Type', 'Product SKU', 'Quantity', 'Unit Price', 'Notes', 'Purchase Number'],
  lpos: ['LPO Number', 'Supplier Name', 'Order Date', 'Expected Delivery Date', 'Status', 'Product SKU', 'Quantity', 'Unit Price', 'Notes'],
  income: ['Entry Number', 'Date', 'Description', 'Amount', 'Notes'],
  expenses: ['Entry Number', 'Date', 'Description', 'Amount', 'Notes'],
};
