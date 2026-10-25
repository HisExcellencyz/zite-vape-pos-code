import * as XLSX from 'xlsx';
import { TEMPLATE_HEADERS } from './exportFormat';

export type TemplateKey = 'products' | 'customers' | 'suppliers' | 'sales' | 'purchases' | 'lpos' | 'income' | 'expenses' | 'storageStock';

// Set by the permissions provider. Only the Owner and Admin get template columns that
// change dates or create backdated entries.
let canBackdateTemplates = false;
export const setTemplateBackdate = (v: boolean) => { canBackdateTemplates = v; };

const IMPORT_TEMPLATES: Record<TemplateKey, { headers: string[]; samples: string[][] }> = {
  products: {
    // Category = top-level category; Subcategory (optional) = the category under it. Both are created if they do not exist yet.
    headers: TEMPLATE_HEADERS.products,
    samples: [], // no sample rows: a sample SKU could overwrite a real product if the template were imported as is
  },
  customers: {
    headers: TEMPLATE_HEADERS.customers,
    samples: [],
  },
  suppliers: {
    headers: TEMPLATE_HEADERS.suppliers,
    samples: [],
  },
  // Stock held in each storage. One row per storage + product; the Quantity becomes that storage's stock level.
  // Same columns as the Storages export. Products are matched by SKU (Product Name is for reference).
  storageStock: {
    headers: TEMPLATE_HEADERS.storageStock,
    samples: [], // no sample rows: they could overwrite real stock levels if the template were imported as is
  },
  // One row per product line. Rows sharing the same Sale Ref become ONE sale.
  // Owner/Admin only: Date (backdate) and Sale Number (change the date of an existing sale).
  sales: {
    headers: TEMPLATE_HEADERS.sales,
    samples: [
      ['S-001', '2025-01-15', 'Jane Doe', '+254712345678', 'M-Pesa', 'SKU-001', '2', '1500', '0', '', ''],
      ['S-001', '2025-01-15', 'Jane Doe', '+254712345678', 'M-Pesa', 'SKU-002', '1', '800', '0', '', ''],
      ['S-002', '15/01/2025 14:30', '', '', 'Cash', 'SKU-001', '1', '1500', '0', 'Walk-in', ''],
      ['', '2025-02-01', '', '', '', '', '', '', '', 'Example: change the date of existing sale #105', '105'],
    ],
  },
  // One row per product line. Rows sharing the same Purchase Ref become ONE purchase.
  // Owner/Admin only: Date (backdate) and Purchase Number (change the date of an existing purchase).
  purchases: {
    headers: TEMPLATE_HEADERS.purchases,
    samples: [
      ['P-001', '2025-01-10', 'Vape Wholesale Ltd', 'Cash', 'SKU-001', '20', '900', '', ''],
      ['P-001', '2025-01-10', 'Vape Wholesale Ltd', 'Cash', 'SKU-002', '10', '450', '', ''],
      ['P-002', '10/01/2025', 'Vape Wholesale Ltd', 'From Deposit', 'SKU-001', '5', '900', 'Paid from deposit', ''],
      ['', '2025-02-01', '', '', '', '', '', 'Example: change the date of existing purchase #12', '12'],
    ],
  },
  // One row per product line. Rows sharing the same LPO Number become ONE purchase order.
  // Owner/Admin only: Order Date other than today; re-importing an existing LPO Number updates its dates.
  lpos: {
    headers: TEMPLATE_HEADERS.lpos,
    samples: [
      ['LPO-0101', 'Vape Wholesale Ltd', '2025-01-05', '2025-01-12', 'Verified', 'SKU-001', '20', '900', ''],
      ['LPO-0101', 'Vape Wholesale Ltd', '2025-01-05', '2025-01-12', 'Verified', 'SKU-002', '10', '450', ''],
    ],
  },
  // Other Income entries. Owner/Admin only: Date and Entry Number (change an existing entry).
  income: {
    headers: TEMPLATE_HEADERS.income,
    samples: [
      ['', '2025-01-20', 'Supplier refund', '1500', ''],
      ['', '', 'Commission received', '800', 'Dated today'],
      ['33', '2025-01-18', '', '', 'Example: change the date of existing entry #33'],
    ],
  },
  // Other Expense entries. Owner/Admin only: Date and Entry Number (change an existing entry).
  expenses: {
    headers: TEMPLATE_HEADERS.expenses,
    samples: [
      ['', '2025-01-20', 'Rent', '25000', ''],
      ['', '', 'Electricity', '3200', 'Dated today'],
      ['18', '2025-01-18', '', '', 'Example: change the date of existing entry #18'],
    ],
  },
};

// Columns that change dates / create backdated entries: left out of the template for everyone except Owner/Admin.
const DATE_COLUMNS: Partial<Record<TemplateKey, string[]>> = {
  sales: ['Date', 'Sale Number'],
  purchases: ['Date', 'Purchase Number'],
  lpos: ['Order Date'],
  income: ['Entry Number', 'Date'],
  expenses: ['Entry Number', 'Date'],
};

const csvCell = (v: string) => (/[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);

export function downloadTemplate(entity: TemplateKey) {
  const t = IMPORT_TEMPLATES[entity];
  const drop = canBackdateTemplates ? [] : DATE_COLUMNS[entity] || [];
  const keep = t.headers.map((h, i) => (drop.includes(h) ? -1 : i)).filter(i => i >= 0);
  // Sample rows that exist only to change a date make no sense without the date columns.
  const samples = canBackdateTemplates ? t.samples : t.samples.filter(r => !/change the date/.test(r.join(' ')));
  const pick = (row: string[]) => keep.map(i => row[i] ?? '');
  // One Excel template per import; the same columns can also be saved and uploaded as .csv.
  const aoa = [t.headers, ...samples].map(pick);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = aoa[0].map((h, i) => ({ wch: Math.max(12, ...aoa.map(r => (r[i] || '').length + 2)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  XLSX.writeFile(wb, `${entity}_import_template.xlsx`);
}

export function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseCsv(text: string): Record<string, string>[] {
  const clean = text.replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseRow(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ''; });
    return obj;
  });
}