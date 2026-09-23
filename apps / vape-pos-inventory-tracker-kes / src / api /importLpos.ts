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

// Returns YYYY-MM-DD. Accepts 2025-01-31 or 31/01/2025 (day first).
function parseDay(s: string): string | null {
  const v = (s || '').trim();
  if (!v) return null;
  let y: number, mo: number, d: number;
  let m = v.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else {
    m = v.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/);
    if (!m) return null;
    d = +m[1]; mo = +m[2]; y = +m[3];
    if (y < 100) y += 2000;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  if (new Date(Date.UTC(y, mo - 1, d)).getUTCDate() !== d) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

// Uses the same lowercase status values the LPO page already works with.
function lpoStatus(s: string) {
  const v = norm(s);
  if (v.startsWith('partial')) return 'partial';
  if (v.startsWith('verif')) return 'verified';
  if (v.startsWith('sent')) return 'sent';
  if (v.startsWith('cancel')) return 'cancelled';
  return 'draft';
}

export default createEndpoint({
  description: 'Bulk import (optionally backdated) purchase orders (LPOs) from CSV rows. Rows with the same LPO Number form one LPO.',
  authenticated: true,
  inputSchema: z.object({
    rows: z.array(z.record(z.string())),
  }),
  outputSchema: z.object({ imported: z.number(), skipped: z.number(), errors: z.array(z.string()) }),
  execute: async ({ input }) => {
    if (input.rows.length > 1500) throw new Error('Too many rows. Import up to 1,500 rows at a time.');

    const errors: string[] = [];
    let imported = 0;
    let skipped = 0;

    const { records: products } = await zite.products.findAll({ limit: 2000 });
    const skuMap = new Map(products.map(p => [(p.sku || '').toLowerCase(), p]));
    const { records: suppliers } = await zite.suppliers.findAll({ limit: 2000 });
    const supplierMap = new Map<string, any>(suppliers.map(s => [(s.supplierName || '').toLowerCase(), s]));
    const { records: existingLpos } = await zite.purchaseOrders.findAll({ limit: 2000 });
    const usedNumbers = new Set(existingLpos.map(o => (o.lpoNumber || '').toLowerCase()));

    const groups = new Map<string, { line: number; r: Record<string, string> }[]>();
    input.rows.forEach((raw, i) => {
      const r = normRow(raw);
      const num = r['lponumber'] || r['lpo'] || r['ref'] || '';
      if (!num) { skipped++; errors.push(`Row ${i + 2}: LPO Number is required`); return; }
      if (!groups.has(num)) groups.set(num, []);
      groups.get(num)!.push({ line: i + 2, r });
    });

    for (const [lpoNumber, lines] of groups) {
      const label = `LPO ${lpoNumber}`;
      try {
        if (usedNumbers.has(lpoNumber.toLowerCase())) {
          skipped++; errors.push(`${label}: number already exists, skipped`); continue;
        }
        const first = lines[0].r;

        const orderStr = lines.map(l => l.r['orderdate'] || l.r['date']).find(Boolean) || '';
        let orderDate = new Date().toISOString().slice(0, 10);
        if (orderStr) {
          const d = parseDay(orderStr);
          if (!d) { skipped++; errors.push(`${label}: invalid order date "${orderStr}" (use YYYY-MM-DD or DD/MM/YYYY)`); continue; }
          orderDate = d;
        }
        const expStr = lines.map(l => l.r['expecteddeliverydate'] || l.r['expecteddelivery']).find(Boolean) || '';
        let expected: string | null = null;
        if (expStr) {
          expected = parseDay(expStr);
          if (!expected) { skipped++; errors.push(`${label}: invalid expected delivery date "${expStr}"`); continue; }
        }

        const supplierName = first['suppliername'] || first['supplier'] || '';
        if (!supplierName) { skipped++; errors.push(`${label}: Supplier Name is required`); continue; }
        let supplier = supplierMap.get(supplierName.toLowerCase());
        if (!supplier) {
          supplier = await zite.suppliers.create({ record: { supplierName, depositBalance: 0, phone: null, email: null, address: null, notes: null } });
          supplierMap.set(supplierName.toLowerCase(), supplier);
        }

        const status = lpoStatus(first['status'] || '');
        const items: any[] = [];
        let bad = false;
        for (const { line, r } of lines) {
          const sku = r['productsku'] || r['sku'] || '';
          const product = skuMap.get(sku.toLowerCase());
          if (!product) { errors.push(`${label}, line ${line}: product SKU "${sku}" not found`); bad = true; break; }
          const qty = parseNum(r['quantity'] || r['qty'] || '');
          if (!(qty > 0)) { errors.push(`${label}, line ${line}: invalid quantity`); bad = true; break; }
          const price = (r['unitprice'] || r['price'] || '') === '' ? (product.costPrice || 0) : parseNum(r['unitprice'] || r['price']);
          if (!Number.isFinite(price) || price < 0) { errors.push(`${label}, line ${line}: invalid unit price`); bad = true; break; }
          items.push({
            productId: product.id,
            productName: product.productName || '',
            sku: product.sku || '',
            quantity: qty,
            unitPrice: price,
            verified: status === 'verified',
            verifiedQty: status === 'verified' ? qty : 0,
          });
        }
        if (bad) { skipped++; continue; }

        const total = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
        const notes = lines.map(l => l.r['notes']).find(Boolean) || null;

        await zite.purchaseOrders.create({
          record: {
            lpoNumber,
            supplier: supplier.id,
            branch: null,
            orderDate,
            expectedDeliveryDate: expected,
            status,
            totalAmount: total,
            notes,
            itemsJson: JSON.stringify(items),
          },
        });
        usedNumbers.add(lpoNumber.toLowerCase());
        imported++;
      } catch (e: any) {
        skipped++;
        errors.push(`${label}: ${e.message || 'failed'}`);
      }
    }

    return { imported, skipped, errors: errors.slice(0, 50) };
  },
});
