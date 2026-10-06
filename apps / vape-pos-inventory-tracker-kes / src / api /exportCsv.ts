import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { assertCan } from '../lib/permissions';
import { loadCategoryRows } from '../lib/categoryParents';

export default createEndpoint({
  description: 'Export data as CSV for any supported table',
  authenticated: true,
  inputSchema: z.object({
    table: z.enum(['products', 'customers', 'suppliers', 'sales', 'purchases', 'expenses']),
  }),
  outputSchema: z.object({ csv: z.string(), filename: z.string() }),
  execute: async ({ input, context }) => {
    await assertCan(context.user.id, input.table === 'sales' ? 'income' : input.table === 'purchases' ? ['purchases', 'expenses'] : input.table, 'export');
    let rows: Record<string, unknown>[] = [];
    let headers: string[] = [];
    let filename = '';

    switch (input.table) {
      case 'products': {
        const { records } = await zite.products.findAll({ limit: 2000 });
        // Category = the top-level category; Subcategory = the one under it (blank when the product sits directly in a top-level category).
        const catRows = await loadCategoryRows();
        const catById = new Map<string, { categoryName?: string; parentId: string | null }>(
          catRows.map((c: any) => [c.id, { categoryName: c.categoryName, parentId: c.parentId }]),
        );
        headers = ['Product Name', 'SKU', 'Cost Price', 'Selling Price', 'Stock Quantity', 'Status', 'Tax Rate', 'Category', 'Subcategory'];
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
            'Status': r.status || '',
            'Tax Rate': r.taxRate || 0,
            'Category': parent ? (parent.categoryName || '') : (cat?.categoryName || ''),
            'Subcategory': parent ? (cat?.categoryName || '') : '',
          };
        });
        filename = 'products_export.csv';
        break;
      }
      case 'customers': {
        const { records } = await zite.customers.findAll({ limit: 2000 });
        headers = ['Customer Name', 'Phone Number', 'Email', 'Address'];
        rows = records.map(r => ({
          'Customer Name': r.customerName || '',
          'Phone Number': r.phoneNumber || '',
          'Email': r.email || '',
          'Address': r.address || '',
        }));
        filename = 'customers_export.csv';
        break;
      }
      case 'suppliers': {
        const { records } = await zite.suppliers.findAll({ limit: 2000 });
        headers = ['Supplier Name', 'Phone', 'Email', 'Address', 'Deposit Balance'];
        rows = records.map(r => ({
          'Supplier Name': r.supplierName || '',
          'Phone': r.phone || '',
          'Email': r.email || '',
          'Address': r.address || '',
          'Deposit Balance': r.depositBalance || 0,
        }));
        filename = 'suppliers_export.csv';
        break;
      }
      case 'sales': {
        const { records } = await zite.sales.findAll({ limit: 2000 });
        headers = ['Sale Number', 'Date', 'Payment Method', 'Subtotal', 'Tax', 'Discount', 'Total', 'Status'];
        rows = records.map(r => ({
          'Sale Number': r.saleNumber || '',
          'Date': r.saleDate || '',
          'Payment Method': r.paymentMethod || '',
          'Subtotal': r.subtotal || 0,
          'Tax': r.taxAmount || 0,
          'Discount': r.discount || 0,
          'Total': r.total || 0,
          'Status': r.status || '',
        }));
        filename = 'sales_export.csv';
        break;
      }
      case 'purchases': {
        const { records } = await zite.purchases.findAll({ limit: 2000 });
        headers = ['Purchase Number', 'Date', 'Total', 'Payment Type', 'Notes'];
        rows = records.map(r => ({
          'Purchase Number': r.purchaseNumber || '',
          'Date': r.purchaseDate || '',
          'Total': r.total || 0,
          'Payment Type': r.paymentType || '',
          'Notes': r.notes || '',
        }));
        filename = 'purchases_export.csv';
        break;
      }
      case 'expenses': {
        const { records } = await zite.otherExpenses.findAll({ limit: 2000 });
        headers = ['Expense Number', 'Date', 'Description', 'Amount', 'Notes'];
        rows = records.map(r => ({
          'Expense Number': r.expenseNumber || '',
          'Date': r.expenseDate || '',
          'Description': r.description || '',
          'Amount': r.amount || 0,
          'Notes': r.notes || '',
        }));
        filename = 'expenses_export.csv';
        break;
      }
    }

    // Build CSV
    const escapeCsv = (val: unknown) => {
      const str = String(val ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    const csvLines = [
      headers.join(','),
      ...rows.map(row => headers.map(h => escapeCsv(row[h])).join(',')),
    ];

    return { csv: csvLines.join('\n'), filename };
  },
});
