export type TemplateKey = 'products' | 'customers' | 'suppliers' | 'sales' | 'purchases' | 'lpos';

const IMPORT_TEMPLATES: Record<TemplateKey, { headers: string[]; samples: string[][] }> = {
  products: {
    headers: ['Product Name', 'SKU', 'Cost Price', 'Selling Price', 'Stock Quantity', 'Category'],
    samples: [],
  },
  customers: {
    headers: ['Customer Name', 'Phone Number', 'Email', 'Address'],
    samples: [],
  },
  suppliers: {
    headers: ['Supplier Name', 'Phone', 'Email', 'Address'],
    samples: [],
  },
  // One row per product line. Rows sharing the same Sale Ref become ONE sale.
  sales: {
    headers: ['Sale Ref', 'Date', 'Customer Name', 'Customer Phone', 'Payment Method', 'Product SKU', 'Quantity', 'Unit Price', 'Discount', 'Notes'],
    samples: [
      ['S-001', '2025-01-15', 'Jane Doe', '+254712345678', 'M-Pesa', 'SKU-001', '2', '1500', '0', ''],
      ['S-001', '2025-01-15', 'Jane Doe', '+254712345678', 'M-Pesa', 'SKU-002', '1', '800', '0', ''],
      ['S-002', '15/01/2025 14:30', '', '', 'Cash', 'SKU-001', '1', '1500', '0', 'Walk-in'],
    ],
  },
  // One row per product line. Rows sharing the same Purchase Ref become ONE purchase.
  purchases: {
    headers: ['Purchase Ref', 'Date', 'Supplier Name', 'Payment Type', 'Product SKU', 'Quantity', 'Unit Price', 'Notes'],
    samples: [
      ['P-001', '2025-01-10', 'Vape Wholesale Ltd', 'Cash', 'SKU-001', '20', '900', ''],
      ['P-001', '2025-01-10', 'Vape Wholesale Ltd', 'Cash', 'SKU-002', '10', '450', ''],
      ['P-002', '10/01/2025', 'Vape Wholesale Ltd', 'From Deposit', 'SKU-001', '5', '900', 'Paid from deposit'],
    ],
  },
  // One row per product line. Rows sharing the same LPO Number become ONE purchase order.
  lpos: {
    headers: ['LPO Number', 'Supplier Name', 'Order Date', 'Expected Delivery Date', 'Status', 'Product SKU', 'Quantity', 'Unit Price', 'Notes'],
    samples: [
      ['LPO-0101', 'Vape Wholesale Ltd', '2025-01-05', '2025-01-12', 'Verified', 'SKU-001', '20', '900', ''],
      ['LPO-0101', 'Vape Wholesale Ltd', '2025-01-05', '2025-01-12', 'Verified', 'SKU-002', '10', '450', ''],
    ],
  },
};

const csvCell = (v: string) => (/[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);

export function downloadTemplate(entity: TemplateKey) {
  const t = IMPORT_TEMPLATES[entity];
  const lines = [t.headers, ...t.samples].map(row => row.map(csvCell).join(','));
  downloadCsv(lines.join('\n') + '\n', `${entity}_import_template.csv`);
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
