import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { assertCan } from '../lib/permissions';
import { loadCategoryRows } from '../lib/categoryParents';
import { TEMPLATE_HEADERS, exportDate, toCsv } from '../lib/exportFormat';

// Every export uses exactly the columns of its import template (TEMPLATE_HEADERS), with dates
// written as the importers read them, so a file can be exported, edited and imported back.
// Sales and purchases have one row per item; rows of the same sale share its Sale Ref, and the
// Sale Number column means "this sale already exists", so re-importing never creates duplicates.

const n = (v: unknown) => Number(v ?? 0) || 0;

export default createEndpoint({
  description: 'Export data as CSV in the same format as the matching import template',
  authenticated: true,
  inputSchema: z.object({
    table: z.enum(['products', 'customers', 'suppliers', 'sales', 'purchases', 'expenses']),
  }),
  outputSchema: z.object({ csv: z.string(), filename: z.string() }),
  execute: async ({ input, context }) => {
    await assertCan(context.user.id, input.table === 'sales' ? 'income' : input.table === 'purchases' ? ['purchases', 'expenses'] : input.table, 'export');
    let rows: Record<string, unknown>[] = [];

    switch (input.table) {
      case 'products': {
        const [{ records }, catRows] = await Promise.all([zite.products.findAll({ limit: 2000 }), loadCategoryRows()]);
        // Category = the top-level category; Subcategory = the one under it (blank when the product sits directly in a top-level category).
        const catById = new Map<string, { categoryName?: string; parentId: string | null }>(
          catRows.map((c: any) => [c.id, { categoryName: c.categoryName, parentId: c.parentId }]),
        );
        rows = records.map(r => {
          const catId = Array.isArray(r.category) ? r.category[0] : r.category;
          const cat = catId ? catById.get(catId) : undefined;
          const parent = cat?.parentId ? catById.get(cat.parentId) : undefined;
          return {
            'Product Name': r.productName || '',
            'SKU': r.sku || '',
            'Cost Price': r.costPrice || 0,
            'Selling Price': r.sellingPrice || 0,
            'Stock Quantity': r.stockQuantity || 0,
            'Category': parent ? (parent.categoryName || '') : (cat?.categoryName || ''),
            'Subcategory': parent ? (cat?.categoryName || '') : '',
            'Image URL': (r as any).images?.[0]?.url || '',
          };
        });
        break;
      }
      case 'customers': {
        const { records } = await zite.customers.findAll({ limit: 2000 });
        rows = records.map(r => ({
          'Customer Name': r.customerName || '',
          'Phone Number': r.phoneNumber || '',
          'Email': r.email || '',
          'Address': r.address || '',
        }));
        break;
      }
      case 'suppliers': {
        const { records } = await zite.suppliers.findAll({ limit: 2000 });
        rows = records.map(r => ({
          'Supplier Name': r.supplierName || '',
          'Phone': r.phone || '',
          'Email': r.email || '',
          'Address': r.address || '',
        }));
        break;
      }
      case 'sales': {
        const { rows: lines } = await zite.sql({
          query: `SELECT s.id, s."saleNumber", s."saleDate", s."paymentMethod", s."discount" AS "saleDiscount", s."notes", s."status",
                    c."customerName", c."phoneNumber", p."sku", si."quantity", si."unitPrice", si."discount" AS "itemDiscount"
                  FROM "Sales" s
                  LEFT JOIN "CustomersSales" cs ON cs."salesId" = s.id
                  LEFT JOIN "Customers" c ON c.id = cs."customersId"
                  LEFT JOIN "SaleItemsSales" l ON l."salesId" = s.id
                  LEFT JOIN "SaleItems" si ON si.id = l."saleItemsId"
                  LEFT JOIN "ProductsSaleItems" lp ON lp."saleItemsId" = si.id
                  LEFT JOIN "Products" p ON p.id = lp."productsId"
                 ORDER BY s."saleNumber", si."itemNumber"`,
        });
        const firstLine = new Set<string>();
        rows = lines.map(r => {
          const first = !firstLine.has(String(r.id));
          firstLine.add(String(r.id));
          const notes = [r.status === 'Voided' ? 'VOIDED' : '', String(r.notes || '').replace(/\s+/g, ' ').trim()].filter(Boolean).join(' | ');
          return {
            'Sale Ref': `S-${r.saleNumber ?? ''}`,
            'Date': exportDate(r.saleDate),
            'Customer Name': r.customerName || '',
            'Customer Phone': r.phoneNumber || '',
            'Payment Method': r.paymentMethod || '',
            'Product SKU': r.sku || '',
            'Quantity': r.quantity ?? '',
            'Unit Price': r.unitPrice ?? '',
            // The sale-level discount goes on the sale's first line, plus any discount on the line itself.
            'Discount': n(r.itemDiscount) + (first ? n(r.saleDiscount) : 0),
            'Notes': first ? notes : '',
            'Sale Number': r.saleNumber ?? '',
          };
        });
        break;
      }
      case 'purchases': {
        const { rows: lines } = await zite.sql({
          query: `SELECT pu.id, pu."purchaseNumber", pu."purchaseDate", pu."paymentType", pu."notes",
                    su."supplierName", p."sku", pi."quantity", pi."unitPrice"
                  FROM "Purchases" pu
                  LEFT JOIN "PurchasesSuppliers" ps ON ps."purchasesId" = pu.id
                  LEFT JOIN "Suppliers" su ON su.id = ps."suppliersId"
                  LEFT JOIN "PurchaseItemsPurchases" l ON l."purchasesId" = pu.id
                  LEFT JOIN "PurchaseItems" pi ON pi.id = l."purchaseItemsId"
                  LEFT JOIN "ProductsPurchaseItems" lp ON lp."purchaseItemsId" = pi.id
                  LEFT JOIN "Products" p ON p.id = lp."productsId"
                 ORDER BY pu."purchaseNumber", pi."itemNumber"`,
        });
        const firstLine = new Set<string>();
        rows = lines.map(r => {
          const first = !firstLine.has(String(r.id));
          firstLine.add(String(r.id));
          return {
            'Purchase Ref': `P-${r.purchaseNumber ?? ''}`,
            'Date': exportDate(r.purchaseDate),
            'Supplier Name': r.supplierName || '',
            'Payment Type': r.paymentType || '',
            'Product SKU': r.sku || '',
            'Quantity': r.quantity ?? '',
            'Unit Price': r.unitPrice ?? '',
            'Notes': first ? String(r.notes || '').replace(/\s+/g, ' ').trim() : '',
            'Purchase Number': r.purchaseNumber ?? '',
          };
        });
        break;
      }
      case 'expenses': {
        const { records } = await zite.otherExpenses.findAll({ limit: 2000 });
        rows = [...records].sort((a, b) => n(a.expenseNumber) - n(b.expenseNumber)).map(r => ({
          'Entry Number': r.expenseNumber ?? '',
          'Date': exportDate(r.expenseDate),
          'Description': r.description || '',
          'Amount': r.amount || 0,
          'Notes': r.notes || '',
        }));
        break;
      }
    }

    return { csv: toCsv(TEMPLATE_HEADERS[input.table], rows), filename: `${input.table}_export.csv` };
  },
});
