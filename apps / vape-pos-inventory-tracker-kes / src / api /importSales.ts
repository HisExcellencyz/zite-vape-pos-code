import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const normRow = (r: Record<string, string>) => {
  const o: Record<string, string> = {};
  for (const [k, v] of Object.entries(r)) o[norm(k)] = String(v ?? '').trim();
  return o;
};
const parseNum = (s: string) => {
  const n = Number(String(s).replace(/,/g, '').replace(/^KES\s*/i, ''));
  return Number.isFinite(n) ? n : NaN;
};
const pad = (n: number) => String(n).padStart(2, '0');

// Accepts 2025-01-31, 31/01/2025, 31-01-2025 (day first), optionally with " HH:mm" (East Africa time).
function parseDate(s: string): { iso: string; day: string } | null {
  const v = (s || '').trim();
  if (!v) return null;
  let y: number, mo: number, d: number, h: number | null = null, mi = 0;
  let m = v.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) {
    y = +m[1]; mo = +m[2]; d = +m[3];
    if (m[4]) { h = +m[4]; mi = +m[5]; }
  } else {
    m = v.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?/);
    if (!m) return null;
    d = +m[1]; mo = +m[2]; y = +m[3];
    if (y < 100) y += 2000;
    if (m[4]) { h = +m[4]; mi = +m[5]; }
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  if (new Date(Date.UTC(y, mo - 1, d)).getUTCDate() !== d) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d, h === null ? 12 : h - 3, mi));
  return { iso: dt.toISOString(), day: `${y}-${pad(mo)}-${pad(d)}` };
}

function paymentMethod(s: string) {
  const v = norm(s);
  if (v.includes('mpesa')) return 'M-Pesa';
  if (v.includes('card')) return 'Card';
  if (v.includes('bank')) return 'Bank Transfer';
  return 'Cash';
}

export default createEndpoint({
  description: 'Bulk import (optionally backdated) sales from CSV rows. Rows with the same Sale Ref form one sale.',
  authenticated: true,
  inputSchema: z.object({
    rows: z.array(z.record(z.string())),
    adjustStock: z.boolean().optional(),
  }),
  outputSchema: z.object({ imported: z.number(), skipped: z.number(), errors: z.array(z.string()) }),
  execute: async ({ input, context }) => {
    if (input.rows.length > 1500) throw new Error('Too many rows. Import up to 1,500 rows at a time.');

    const errors: string[] = [];
    let imported = 0;
    let skipped = 0;

    const { records: products } = await zite.products.findAll({ limit: 2000 });
    const skuMap = new Map(products.map(p => [(p.sku || '').toLowerCase(), p]));
    const { records: customers } = await zite.customers.findAll({ limit: 2000 });
    const phoneMap = new Map(customers.map(c => [(c.phoneNumber || '').replace(/\D/g, ''), c]));

    // Refs already imported earlier are skipped so a file can't be imported twice.
    const existing = await zite.sql({
      query: `SELECT "notes" FROM "Sales" WHERE "notes" LIKE $1`,
      params: ['Import ref: %'],
    });
    const doneRefs = new Set(
      existing.rows.map(r => String(r.notes || '').replace(/^Import ref: /, '').split(' | ')[0]),
    );

    const groups = new Map<string, { line: number; r: Record<string, string> }[]>();
    input.rows.forEach((raw, i) => {
      const r = normRow(raw);
      const ref = r['saleref'] || r['ref'] || '';
      const key = ref || `__row${i}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push({ line: i + 2, r });
    });

    const stockDelta = new Map<string, number>();

    for (const [key, lines] of groups) {
      const ref = key.startsWith('__row') ? '' : key;
      const label = ref ? `Sale ${ref}` : `Row ${lines[0].line}`;
      try {
        if (ref && doneRefs.has(ref)) { skipped++; errors.push(`${label}: already imported earlier, skipped`); continue; }

        const dateStr = lines.map(l => l.r['date'] || l.r['saledate']).find(Boolean) || '';
        let saleDate = new Date().toISOString();
        if (dateStr) {
          const pd = parseDate(dateStr);
          if (!pd) { skipped++; errors.push(`${label}: invalid date "${dateStr}" (use YYYY-MM-DD or DD/MM/YYYY)`); continue; }
          saleDate = pd.iso;
        }

        const items: any[] = [];
        let bad = false;
        for (const { line, r } of lines) {
          const sku = r['productsku'] || r['sku'] || '';
          const product = skuMap.get(sku.toLowerCase());
          if (!product) { errors.push(`${label}, line ${line}: product SKU "${sku}" not found`); bad = true; break; }
          const qty = parseNum(r['quantity'] || r['qty'] || '');
          if (!(qty > 0)) { errors.push(`${label}, line ${line}: invalid quantity`); bad = true; break; }
          const price = (r['unitprice'] || r['price'] || '') === '' ? (product.sellingPrice || 0) : parseNum(r['unitprice'] || r['price']);
          if (!Number.isFinite(price) || price < 0) { errors.push(`${label}, line ${line}: invalid unit price`); bad = true; break; }
          const discount = r['discount'] ? parseNum(r['discount']) : 0;
          if (!Number.isFinite(discount) || discount < 0) { errors.push(`${label}, line ${line}: invalid discount`); bad = true; break; }
          items.push({ product, qty, price, discount, lineTotal: price * qty - discount });
        }
        if (bad) { skipped++; continue; }

        // Customer (optional)
        const first = lines[0].r;
        const phoneDigits = (first['customerphone'] || first['phone'] || '').replace(/\D/g, '');
        let customerId: string | null = null;
        if (phoneDigits) {
          let cust = phoneMap.get(phoneDigits);
          const custName = first['customername'] || '';
          if (!cust && custName) {
            cust = await zite.customers.create({ record: { customerName: custName, phoneNumber: '+' + phoneDigits, email: null, address: null, notes: null } });
            phoneMap.set(phoneDigits, cust);
          }
          if (cust) customerId = cust.id;
        }

        const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
        const extraNotes = lines.map(l => l.r['notes']).find(Boolean);
        const notes = ref ? `Import ref: ${ref}${extraNotes ? ' | ' + extraNotes : ''}` : (extraNotes || 'Imported');

        const sale = await zite.sales.create({
          record: {
            saleDate,
            customer: customerId,
            branch: null,
            paymentMethod: paymentMethod(first['paymentmethod'] || first['payment'] || ''),
            subtotal,
            taxAmount: 0,
            discount: 0,
            total: subtotal,
            status: 'Completed',
            notes,
            createdBy: context.user.id,
          },
        });

        const itemRecords = items.map(i => ({
          sale: sale.id,
          product: i.product.id,
          quantity: i.qty,
          unitPrice: i.price,
          taxAmount: 0,
          discount: i.discount,
          lineTotal: i.lineTotal,
        }));
        for (let i = 0; i < itemRecords.length; i += 100) {
          await zite.saleItems.bulkCreate({ records: itemRecords.slice(i, i + 100) });
        }

        if (input.adjustStock) {
          for (const i of items) stockDelta.set(i.product.id, (stockDelta.get(i.product.id) || 0) + i.qty);
        }
        if (ref) doneRefs.add(ref);
        imported++;
      } catch (e: any) {
        skipped++;
        errors.push(`${label}: ${e.message || 'failed'}`);
      }
    }

    for (const [productId, delta] of stockDelta) {
      const p = products.find(x => x.id === productId);
      if (!p) continue;
      await zite.products.update({ id: productId, record: { stockQuantity: Math.max(0, (p.stockQuantity || 0) - delta) } });
    }

    return { imported, skipped, errors: errors.slice(0, 50) };
  },
});
