const IMPORT_TEMPLATES: Record<string, string[]> = {
  products: ['Product Name', 'SKU', 'Cost Price', 'Selling Price', 'Stock Quantity', 'Category'],
  customers: ['Customer Name', 'Phone Number', 'Email', 'Address'],
  suppliers: ['Supplier Name', 'Phone', 'Email', 'Address'],
};

export function downloadTemplate(entity: keyof typeof IMPORT_TEMPLATES) {
  const headers = IMPORT_TEMPLATES[entity];
  const csv = headers.join(',') + '\n';
  downloadCsv(csv, `${entity}_import_template.csv`);
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
  const lines = text.split('\n').filter(l => l.trim());
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
