import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

const num = (v: unknown) => Number(v ?? 0) || 0;
const DAY = 86_400_000;

/** Units per day over a window ending now. */
const ratePerDay = (units: number, fromMs: number) => {
  const days = Math.max(1, (Date.now() - fromMs) / DAY);
  return Math.round((units / days) * 100) / 100;
};

/** Last 6 calendar months, oldest first, as yyyy-mm keys. */
const lastMonths = () => {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 5; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
};
const monthKey = (iso?: string | null) => (iso ? String(iso).slice(0, 7) : '');

async function settingsCfg() {
  const s = await zite.businessSettings.findOne({});
  try { return s?.customFields ? JSON.parse(s.customFields) : {}; } catch { return {}; }
}

export default createEndpoint({
  description: 'Transaction history and key figures for one customer, supplier or product',
  authenticated: true,
  inputSchema: z.object({
    kind: z.enum(['customer', 'supplier', 'product']),
    id: z.string(),
  }),
  outputSchema: z.object({
    stats: z.array(z.object({ label: z.string(), value: z.string(), sub: z.string().optional() })),
    sections: z.array(z.object({
      title: z.string(),
      columns: z.array(z.object({ key: z.string(), label: z.string(), align: z.string().optional(), money: z.boolean().optional(), date: z.boolean().optional() })),
      rows: z.array(z.record(z.string(), z.any())),
    })),
    months: z.array(z.object({ month: z.string(), value: z.number(), units: z.number().optional() })),
    monthsLabel: z.string(),
  }),
  execute: async ({ input }) => {
    const kes = (n: number) => `KES ${Math.round(n).toLocaleString()}`;
    const months = lastMonths();

    if (input.kind === 'customer') {
      const [salesRes, topRes] = await Promise.all([
        zite.sql({
          query: `SELECT s.id, s."saleNumber", s."saleDate", s."total", s."status", s."paymentMethod", s."discount", s."deductions",
                    (SELECT string_agg(COALESCE(p."productName", 'Item') || ' ×' || si."quantity", ', ')
                       FROM "SaleItemsSales" l JOIN "SaleItems" si ON si.id = l."saleItemsId"
                       LEFT JOIN "ProductsSaleItems" lp ON lp."saleItemsId" = si.id LEFT JOIN "Products" p ON p.id = lp."productsId"
                      WHERE l."salesId" = s.id) AS items
                  FROM "CustomersSales" cs JOIN "Sales" s ON s.id = cs."salesId"
                 WHERE cs."customersId" = $1 ORDER BY s."saleDate" DESC NULLS LAST`,
          params: [input.id],
        }),
        zite.sql({
          query: `SELECT COALESCE(p."productName", 'Item') AS name, SUM(si."quantity") AS units, SUM(si."lineTotal") AS spent
                  FROM "CustomersSales" cs JOIN "Sales" s ON s.id = cs."salesId" AND s."status" <> 'Voided'
                  JOIN "SaleItemsSales" l ON l."salesId" = s.id JOIN "SaleItems" si ON si.id = l."saleItemsId"
                  LEFT JOIN "ProductsSaleItems" lp ON lp."saleItemsId" = si.id LEFT JOIN "Products" p ON p.id = lp."productsId"
                 WHERE cs."customersId" = $1 GROUP BY 1 ORDER BY units DESC LIMIT 5`,
          params: [input.id],
        }),
      ]);
      const sales = salesRes.rows;
      const live = sales.filter(s => s.status !== 'Voided');
      const spent = live.reduce((a, s) => a + num(s.total), 0);
      const first = live[live.length - 1]?.saleDate, last = live[0]?.saleDate;
      const daysSince = last ? Math.floor((Date.now() - new Date(String(last)).getTime()) / DAY) : null;
      return {
        stats: [
          { label: 'Total Spent', value: kes(spent), sub: `${live.length} sales` },
          { label: 'Average Sale', value: kes(live.length ? spent / live.length : 0) },
          { label: 'Last Purchase', value: daysSince === null ? '-' : daysSince === 0 ? 'Today' : `${daysSince} days ago`, sub: first ? `Customer since ${String(first).slice(0, 10)}` : undefined },
          { label: 'Favourite', value: String(topRes.rows[0]?.name ?? '-'), sub: topRes.rows[0] ? `${num(topRes.rows[0].units)} unit${num(topRes.rows[0].units) === 1 ? '' : 's'} bought` : undefined },
        ],
        sections: [
          {
            title: 'Sales',
            columns: [
              { key: 'saleNumber', label: '#' }, { key: 'saleDate', label: 'Date', date: true }, { key: 'items', label: 'Items' },
              { key: 'paymentMethod', label: 'Payment' }, { key: 'status', label: 'Status' }, { key: 'total', label: 'Total', align: 'right', money: true },
            ],
            rows: sales,
          },
          {
            title: 'Most bought',
            columns: [{ key: 'name', label: 'Product' }, { key: 'units', label: 'Units', align: 'right' }, { key: 'spent', label: 'Spent', align: 'right', money: true }],
            rows: topRes.rows,
          },
        ],
        months: months.map(m => ({ month: m, value: live.filter(s => monthKey(s.saleDate as string) === m).reduce((a, s) => a + num(s.total), 0) })),
        monthsLabel: 'Spend per month',
      };
    }

    if (input.kind === 'supplier') {
      const [supplier, purchasesRes, ordersRes, txRes, cfg] = await Promise.all([
        zite.suppliers.findOne({ id: input.id }),
        zite.sql({
          query: `SELECT pu.id, pu."purchaseNumber", pu."purchaseDate", pu."total", pu."paymentType",
                    (SELECT string_agg(COALESCE(p."productName", 'Item') || ' ×' || pi."quantity", ', ')
                       FROM "PurchaseItemsPurchases" l JOIN "PurchaseItems" pi ON pi.id = l."purchaseItemsId"
                       LEFT JOIN "ProductsPurchaseItems" lp ON lp."purchaseItemsId" = pi.id LEFT JOIN "Products" p ON p.id = lp."productsId"
                      WHERE l."purchasesId" = pu.id) AS items
                  FROM "PurchasesSuppliers" ps JOIN "Purchases" pu ON pu.id = ps."purchasesId"
                 WHERE ps."suppliersId" = $1 ORDER BY pu."purchaseDate" DESC NULLS LAST`,
          params: [input.id],
        }),
        zite.sql({
          query: `SELECT po."lpoNumber", po."orderDate", po."status", po."totalAmount"
                  FROM "PurchaseOrdersSuppliers" l JOIN "PurchaseOrders" po ON po.id = l."purchaseOrdersId"
                 WHERE l."suppliersId" = $1 ORDER BY po."orderDate" DESC NULLS LAST`,
          params: [input.id],
        }),
        zite.sql({
          query: `SELECT t."transactionNumber", t."transactionDate", t."type", t."amount", t."runningBalance", t."notes"
                  FROM "SupplierTransactionsSuppliers" l JOIN "SupplierTransactions" t ON t.id = l."supplierTransactionsId"
                 WHERE l."suppliersId" = $1 ORDER BY t."transactionDate" DESC NULLS LAST`,
          params: [input.id],
        }),
        settingsCfg(),
      ]);
      const purchases = purchasesRes.rows;
      const bills = (Array.isArray(cfg.supplierBills) ? cfg.supplierBills : [])
        .filter((b: any) => b.supplierId === input.id)
        .sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)))
        .map((b: any) => ({
          ...b,
          items: (b.items || []).map((i: any) => `${i.name} ×${i.quantity}`).join(', ') || b.notes || '',
          state: b.status === 'paid' ? `Paid${b.paidFrom ? ` (${b.paidFrom === 'pettycash' ? 'petty cash' : b.paidFrom})` : ''}` : 'Pending',
        }));
      const bought = purchases.reduce((a, p) => a + num(p.total), 0);
      const billed = bills.reduce((a: number, b: any) => a + num(b.amount), 0);
      const pending = bills.filter((b: any) => b.status !== 'paid').reduce((a: number, b: any) => a + num(b.amount), 0);
      const lastDates = [purchases[0]?.purchaseDate, bills[0]?.date].filter(Boolean).map(String).sort();
      return {
        stats: [
          { label: 'Purchases', value: kes(bought), sub: `${purchases.length} purchases` },
          { label: 'Pick-up Bills', value: kes(billed), sub: `${bills.length} bills · ${kes(pending)} pending` },
          { label: 'Deposit Balance', value: kes(num(supplier?.depositBalance)) },
          { label: 'Last Supplied', value: lastDates.length ? lastDates[lastDates.length - 1].slice(0, 10) : '-', sub: `${ordersRes.rows.length} purchase orders` },
        ],
        sections: [
          {
            title: 'Purchases',
            columns: [
              { key: 'purchaseNumber', label: '#' }, { key: 'purchaseDate', label: 'Date', date: true }, { key: 'items', label: 'Items' },
              { key: 'paymentType', label: 'Payment' }, { key: 'total', label: 'Total', align: 'right', money: true },
            ],
            rows: purchases,
          },
          {
            title: 'Bills',
            columns: [
              { key: 'date', label: 'Date', date: true }, { key: 'items', label: 'Items' }, { key: 'state', label: 'Status' },
              { key: 'amount', label: 'Amount', align: 'right', money: true },
            ],
            rows: bills,
          },
          {
            title: 'Purchase orders',
            columns: [
              { key: 'lpoNumber', label: 'LPO' }, { key: 'orderDate', label: 'Date', date: true }, { key: 'status', label: 'Status' },
              { key: 'totalAmount', label: 'Total', align: 'right', money: true },
            ],
            rows: ordersRes.rows,
          },
          {
            title: 'Deposits',
            columns: [
              { key: 'transactionDate', label: 'Date', date: true }, { key: 'type', label: 'Type' }, { key: 'notes', label: 'Notes' },
              { key: 'amount', label: 'Amount', align: 'right', money: true }, { key: 'runningBalance', label: 'Balance', align: 'right', money: true },
            ],
            rows: txRes.rows,
          },
        ],
        months: months.map(m => ({
          month: m,
          value: purchases.filter(p => monthKey(p.purchaseDate as string) === m).reduce((a, p) => a + num(p.total), 0)
            + bills.filter((b: any) => monthKey(b.date) === m).reduce((a: number, b: any) => a + num(b.amount), 0),
        })),
        monthsLabel: 'Supplied per month (purchases + bills)',
      };
    }

    // Product
    const [product, salesRes, buysRes, cfg] = await Promise.all([
      zite.products.findOne({ id: input.id }),
      zite.sql({
        query: `SELECT s."saleNumber", s."saleDate", s."status", si."quantity", si."unitPrice", si."lineTotal",
                  (SELECT c."customerName" FROM "CustomersSales" cs JOIN "Customers" c ON c.id = cs."customersId" WHERE cs."salesId" = s.id LIMIT 1) AS customer
                FROM "ProductsSaleItems" lp JOIN "SaleItems" si ON si.id = lp."saleItemsId"
                JOIN "SaleItemsSales" l ON l."saleItemsId" = si.id JOIN "Sales" s ON s.id = l."salesId"
               WHERE lp."productsId" = $1 ORDER BY s."saleDate" DESC NULLS LAST`,
        params: [input.id],
      }),
      zite.sql({
        query: `SELECT pu."purchaseNumber", pu."purchaseDate", pi."quantity", pi."unitPrice", pi."lineTotal",
                  (SELECT su."supplierName" FROM "PurchasesSuppliers" ps JOIN "Suppliers" su ON su.id = ps."suppliersId" WHERE ps."purchasesId" = pu.id LIMIT 1) AS supplier
                FROM "ProductsPurchaseItems" lp JOIN "PurchaseItems" pi ON pi.id = lp."purchaseItemsId"
                JOIN "PurchaseItemsPurchases" l ON l."purchaseItemsId" = pi.id JOIN "Purchases" pu ON pu.id = l."purchasesId"
               WHERE lp."productsId" = $1 ORDER BY pu."purchaseDate" DESC NULLS LAST`,
        params: [input.id],
      }),
      settingsCfg(),
    ]);
    const lines = salesRes.rows;
    const live = lines.filter(l => l.status !== 'Voided');
    const units = live.reduce((a, l) => a + num(l.quantity), 0);
    const revenue = live.reduce((a, l) => a + num(l.lineTotal), 0);
    const since30 = Date.now() - 30 * DAY;
    const units30 = live.filter(l => l.saleDate && new Date(String(l.saleDate)).getTime() >= since30).reduce((a, l) => a + num(l.quantity), 0);
    const firstSale = live[live.length - 1]?.saleDate ? new Date(String(live[live.length - 1].saleDate)).getTime() : Date.now();
    const rate30 = ratePerDay(units30, since30);
    const rateAll = ratePerDay(units, firstSale);
    const stock = num(product?.stockQuantity);
    const daysLeft = rate30 > 0 ? Math.floor(stock / rate30) : null;

    // Stock-ups: purchases plus supplier pick-ups billed at the POS.
    const supplierNames = new Map<string, string>();
    const pickups = (Array.isArray(cfg.supplierBills) ? cfg.supplierBills : [])
      .flatMap((b: any) => (b.items || []).filter((i: any) => i.productId === input.id).map((i: any) => ({ bill: b, i })));
    if (pickups.length) {
      const ids = [...new Set(pickups.map((p: any) => p.bill.supplierId))] as string[];
      const sups = await Promise.all(ids.map(id => zite.suppliers.findOne({ id }).catch(() => null)));
      sups.forEach(s => s && supplierNames.set(s.id, s.supplierName || 'Supplier'));
    }
    const stockups = [
      ...buysRes.rows.map(r => ({ date: r.purchaseDate, source: `Purchase #${r.purchaseNumber ?? ''}`, supplier: r.supplier, quantity: num(r.quantity), unitCost: num(r.unitPrice), total: num(r.lineTotal) })),
      ...pickups.map(({ bill, i }: any) => ({ date: bill.date, source: bill.saleNumber ? `POS pick-up, Sale #${bill.saleNumber}` : 'POS pick-up', supplier: supplierNames.get(bill.supplierId) || 'Supplier', quantity: num(i.quantity), unitCost: num(i.unitCost), total: num(i.quantity) * num(i.unitCost) })),
    ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const boughtUnits = stockups.reduce((a, s) => a + s.quantity, 0);

    return {
      stats: [
        { label: 'Units Sold', value: units.toLocaleString(), sub: `${live.length} sales · ${kes(revenue)}` },
        { label: 'Sale Rate', value: `${rate30}/day`, sub: `last 30 days · ${rateAll}/day overall` },
        { label: 'In Stock', value: stock.toLocaleString(), sub: daysLeft === null ? 'no recent sales' : `about ${daysLeft} days left` },
        { label: 'Average Price', value: kes(units ? revenue / units : 0), sub: `list price ${kes(num(product?.sellingPrice))}` },
        { label: 'Stocked Up', value: boughtUnits.toLocaleString(), sub: `${stockups.length} stock-ups` },
      ],
      sections: [
        {
          title: 'Sales',
          columns: [
            { key: 'saleNumber', label: '#' }, { key: 'saleDate', label: 'Date', date: true }, { key: 'customer', label: 'Customer' },
            { key: 'quantity', label: 'Qty', align: 'right' }, { key: 'unitPrice', label: 'Price', align: 'right', money: true },
            { key: 'lineTotal', label: 'Total', align: 'right', money: true }, { key: 'status', label: 'Status' },
          ],
          rows: lines,
        },
        {
          title: 'Stock-ups',
          columns: [
            { key: 'date', label: 'Date', date: true }, { key: 'source', label: 'From' }, { key: 'supplier', label: 'Supplier' },
            { key: 'quantity', label: 'Qty', align: 'right' }, { key: 'unitCost', label: 'Unit cost', align: 'right', money: true },
            { key: 'total', label: 'Total', align: 'right', money: true },
          ],
          rows: stockups,
        },
      ],
      months: months.map(m => {
        const ms = live.filter(l => monthKey(l.saleDate as string) === m);
        return { month: m, value: ms.reduce((a, l) => a + num(l.lineTotal), 0), units: ms.reduce((a, l) => a + num(l.quantity), 0) };
      }),
      monthsLabel: 'Sales per month',
    };
  },
});
