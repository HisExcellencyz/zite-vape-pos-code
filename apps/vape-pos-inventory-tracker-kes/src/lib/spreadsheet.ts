import * as XLSX from 'xlsx';
import { parseCsv } from './exportHelper';

/** File types every import accepts. Both use the same columns. */
export const IMPORT_ACCEPT = '.xlsx,.xls,.csv';

const pad = (n: number) => String(n).padStart(2, '0');

/** One Excel cell as the text the importers expect (dates become YYYY-MM-DD, or YYYY-MM-DD HH:mm when they carry a time). */
function cellText(c: XLSX.CellObject | undefined): string {
  if (!c || c.v == null) return '';
  if (c.t === 'n' && c.z && XLSX.SSF.is_date(c.z as string)) {
    const d = XLSX.SSF.parse_date_code(c.v as number);
    if (d) {
      const day = `${d.y}-${pad(d.m)}-${pad(d.d)}`;
      return d.H || d.M ? `${day} ${pad(d.H)}:${pad(d.M)}` : day;
    }
  }
  if (c.t === 'd' && c.v instanceof Date) {
    const d = c.v;
    const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return d.getHours() || d.getMinutes() ? `${day} ${pad(d.getHours())}:${pad(d.getMinutes())}` : day;
  }
  if (c.t === 'b') return c.v ? 'TRUE' : 'FALSE';
  // Whole numbers keep every digit (phone numbers, SKUs); decimals lose float noise.
  if (c.t === 'n') return Number.isInteger(c.v) ? String(c.v) : String(Math.round((c.v as number) * 1e6) / 1e6);
  return String(c.v).trim();
}

/** Rows of the first sheet of an Excel file, keyed by the header row, all values as text. */
function readExcel(buf: ArrayBuffer): Record<string, string>[] {
  const wb = XLSX.read(buf, { type: 'array', cellNF: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws || !ws['!ref']) return [];
  const range = XLSX.utils.decode_range(ws['!ref']);
  const at = (r: number, c: number) => cellText(ws[XLSX.utils.encode_cell({ r, c })]);
  const headers: string[] = [];
  for (let c = range.s.c; c <= range.e.c; c++) headers.push(at(range.s.r, c));
  const rows: Record<string, string>[] = [];
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const obj: Record<string, string> = {};
    let any = false;
    headers.forEach((h, i) => {
      if (!h) return;
      const v = at(r, range.s.c + i);
      obj[h] = v;
      if (v) any = true;
    });
    if (any) rows.push(obj);
  }
  return rows;
}

/** Reads an import file (.xlsx, .xls or .csv) into rows keyed by column header. Both formats give the same result. */
export async function readSpreadsheet(file: File): Promise<Record<string, string>[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return readExcel(await file.arrayBuffer());
  if (name.endsWith('.csv') || name.endsWith('.txt') || file.type.includes('csv')) return parseCsv(await file.text());
  throw new Error('Choose an Excel (.xlsx) or CSV (.csv) file');
}
