import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Dashboard statistics with period and outlet (branch) filtering',
  authenticated: true,
  inputSchema: z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    branchId: z.string().optional(),
  }),
  outputSchema: z.object({
    totalSales: z.number(),
    totalRevenue: z.number(),
    totalOtherIncome: z.number(),
    totalExpenses: z.number(),
    totalDeductions: z.number(),
    totalDiscounts: z.number(),
    totalPurchases: z.number(),
    profitLoss: z.number(),
    stockValue: z.number(),
    topProducts: z.array(z.object({
      productName: z.string(),
      totalSold: z.number(),
      revenue: z.number(),
    })),
    topCustomers: z.array(z.object({
      customerName: z.string(),
      phone: z.string(),
      orderCount: z.number(),
      totalSpent: z.number(),
    })),
    revenueByDay: z.array(z.object({ date: z.string(), revenue: z.number() })),
    expensesByCategory: z.array(z.object({ category: z.string(), amount: z.number() })),
    deliveryStats: z.object({
      totalDeliveries: z.number(),
      avgDistanceKm: z.number(),
      longestKm: z.number(),
      shortestKm: z.number(),
    }),
    riderStats: z.array(z.object({
      name: z.string(),
      type: z.string(),
      orders: z.number(),
      amount: z.number(),
      km: z.number(),
      riderCharge: z.number(),
    })),
  }),
  execute: async ({ input }) => {
    const params: (string | Date)[] = [];
    let dateFilter = '';
    let idx = 1;

    if (input.startDate) {
      dateFilter += ` AND s."saleDate" >= $${idx}`;
      params.push(input.startDate);
      idx++;
    }
    if (input.endDate) {
      dateFilter += ` AND s."saleDate" <= $${idx}`;
      params.push(input.endDate);
      idx++;
    }
    // Restrict to a single outlet when one is selected. Appending this to
    // dateFilter/params (rather than only the first query) means it also
    // applies automatically to topProducts, topCustomers and revenueByDay
    // below, since they reuse the same dateFilter string and params array.
    if (input.branchId) {
      dateFilter += ` AND EXISTS (SELECT 1 FROM "BranchesSales" bs WHERE bs."salesId" = s.id AND bs."branchesId" = $${idx})`;
      params.push(input.branchId);
      idx++;
    }

    // Total sales & revenue
    const salesResult = await zite.sql({
      query: `
        SELECT COUNT(DISTINCT s.id) AS "totalSales",
               COALESCE(SUM(s."total" + COALESCE(s."discount", 0)), 0) AS "totalRevenue",
               COALESCE(SUM(s."deductions"), 0) AS "totalDeductions",
               COALESCE(SUM(s."discount"), 0) AS "totalDiscounts"
        FROM "Sales" s
        WHERE s."status" = 'Completed'${dateFilter}
      `,
      params,
    });

    // Total purchases
    const purchaseParams: string[] = [];
    let purchaseDateFilter = '';
    let pIdx = 1;
    if (input.startDate) {
      purchaseDateFilter += ` AND p."purchaseDate" >= $${pIdx}`;
      purchaseParams.push(input.startDate);
      pIdx++;
    }
    if (input.endDate) {
      purchaseDateFilter += ` AND p."purchaseDate" <= $${pIdx}`;
      purchaseParams.push(input.endDate);
      pIdx++;
    }
    if (input.branchId) {
      purchaseDateFilter += ` AND EXISTS (SELECT 1 FROM "BranchesPurchases" bp WHERE bp."purchasesId" = p.id AND bp."branchesId" = $${pIdx})`;
      purchaseParams.push(input.branchId);
      pIdx++;
    }

    const purchasesResult = await zite.sql({
      query: `
        SELECT COALESCE(SUM(p."total"), 0) AS "totalPurchases"
        FROM "Purchases" p
        WHERE 1=1${purchaseDateFilter}
      `,
      params: purchaseParams,
    });

    // Other expenses
    const expParams: string[] = [];
    let expDateFilter = '';
    let eIdx = 1;
    if (input.startDate) {
      expDateFilter += ` AND e."expenseDate" >= $${eIdx}`;
      expParams.push(input.startDate);
      eIdx++;
    }
    if (input.endDate) {
      expDateFilter += ` AND e."expenseDate" <= $${eIdx}`;
      expParams.push(input.endDate);
      eIdx++;
    }
    if (input.branchId) {
      expDateFilter += ` AND EXISTS (SELECT 1 FROM "BranchesOtherExpenses" be WHERE be."otherExpensesId" = e.id AND be."branchesId" = $${eIdx})`;
      expParams.push(input.branchId);
      eIdx++;
    }

    const expensesResult = await zite.sql({
      query: `
        SELECT COALESCE(SUM(e."amount"), 0) AS "totalExpenses"
        FROM "OtherExpenses" e
        WHERE 1=1${expDateFilter}
      `,
      params: expParams,
    });

    // Other income
    const incParams: string[] = [];
    let incDateFilter = '';
    let iIdx = 1;
    if (input.startDate) {
      incDateFilter += ` AND i."incomeDate" >= $${iIdx}`;
      incParams.push(input.startDate);
      iIdx++;
    }
    if (input.endDate) {
      incDateFilter += ` AND i."incomeDate" <= $${iIdx}`;
      incParams.push(input.endDate);
      iIdx++;
    }
    if (input.branchId) {
      incDateFilter += ` AND EXISTS (SELECT 1 FROM "BranchesOtherIncome" bi WHERE bi."otherIncomeId" = i.id AND bi."branchesId" = $${iIdx})`;
      incParams.push(input.branchId);
      iIdx++;
    }

    const incomeResult = await zite.sql({
      query: `
        SELECT COALESCE(SUM(i."amount"), 0) AS "totalOtherIncome"
        FROM "OtherIncome" i
        WHERE 1=1${incDateFilter}
      `,
      params: incParams,
    });

    // Stock value (optionally scoped to products assigned to this outlet)
    const stockParams: string[] = [];
    let stockBranchFilter = '';
    if (input.branchId) {
      stockBranchFilter = ` AND EXISTS (SELECT 1 FROM "BranchesProducts" bpr WHERE bpr."productsId" = "Products".id AND bpr."branchesId" = $1)`;
      stockParams.push(input.branchId);
    }
    const stockResult = await zite.sql({
      query: `
        SELECT COALESCE(SUM("costPrice" * "stockQuantity"), 0) AS "stockValue"
        FROM "Products"
        WHERE "status" = 'Active'${stockBranchFilter}
      `,
      params: stockParams,
    });

    // Top products
    const topProducts = await zite.sql({
      query: `
        SELECT p."productName", 
               COALESCE(SUM(si."quantity"), 0) AS "totalSold",
               COALESCE(SUM(si."lineTotal"), 0) AS revenue
        FROM "Products" p
        JOIN "ProductsSaleItems" l ON l."productsId" = p.id
        JOIN "SaleItems" si ON si.id = l."saleItemsId"
        JOIN "SaleItemsSales" ls ON ls."saleItemsId" = si.id
        JOIN "Sales" s ON s.id = ls."salesId"
        WHERE s."status" = 'Completed'${dateFilter}
        GROUP BY p.id
        ORDER BY "totalSold" DESC
        LIMIT 10
      `,
      params,
    });

    // Top customers
    const topCustomers = await zite.sql({
      query: `
        SELECT c."customerName", c."phoneNumber" AS phone,
               COUNT(DISTINCT s.id) AS "orderCount",
               COALESCE(SUM(s."total"), 0) AS "totalSpent"
        FROM "Customers" c
        JOIN "CustomersSales" l ON l."customersId" = c.id
        JOIN "Sales" s ON s.id = l."salesId"
        WHERE s."status" = 'Completed'${dateFilter}
        GROUP BY c.id
        ORDER BY "totalSpent" DESC
        LIMIT 25
      `,
      params,
    });

    // Revenue by day (last 30 days default)
    const revByDay = await zite.sql({
      query: `
        SELECT to_char(s."saleDate" AT TIME ZONE 'Africa/Nairobi', 'YYYY-MM-DD') AS date,
               COALESCE(SUM(s."total" + COALESCE(s."discount", 0)), 0) AS revenue
        FROM "Sales" s
        WHERE s."status" = 'Completed'
          AND s."saleDate" IS NOT NULL
          ${input.startDate ? '' : `AND s."saleDate" >= now() - interval '30 days'`}${dateFilter}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      params,
    });

    // Expenses by category
    const expByCat = await zite.sql({
      query: `
        SELECT COALESCE(ec."categoryName", 'Uncategorized') AS category,
               COALESCE(SUM(e."amount"), 0) AS amount
        FROM "OtherExpenses" e
        LEFT JOIN "ExpenseCategoriesOtherExpenses" l ON l."otherExpensesId" = e.id
        LEFT JOIN "ExpenseCategories" ec ON ec.id = l."expenseCategoriesId"
        WHERE 1=1${expDateFilter}
        GROUP BY ec."categoryName"
        ORDER BY amount DESC
      `,
      params: expParams,
    });

    // Rider metrics: the rider is noted on each sale as "Rider (3PL): Name" / "Rider (Own): Name".
    // Orders, amount (sale total), distance and the Rider Fee deduction are added up per rider.
    const riderMap = new Map<string, { name: string; type: string; orders: number; amount: number; km: number; riderCharge: number }>();
    const RIDER_NOTE = /Rider \((3PL|Own)\): ([^|]+)/;
    const PAGE = 2000;
    for (let offset = 0; offset < PAGE * 20; offset += PAGE) {
      const page = await zite.sql({
        query: `
          SELECT s.id, s."notes", s."total", s."deliveryDistanceKm", s."deductionDetails"
          FROM "Sales" s
          WHERE s."status" = 'Completed' AND s."notes" LIKE '%Rider (%'${dateFilter}
          ORDER BY s.id
          LIMIT ${PAGE} OFFSET ${offset}
        `,
        params,
      });
      for (const r of page.rows) {
        const m = RIDER_NOTE.exec(String(r.notes || ''));
        if (!m) continue;
        const type = m[1];
        const name = m[2].trim();
        const key = `${type}|${name.toLowerCase()}`;
        const cur = riderMap.get(key) || { name, type, orders: 0, amount: 0, km: 0, riderCharge: 0 };
        cur.orders += 1;
        cur.amount += Number(r.total || 0);
        cur.km += Number(r.deliveryDistanceKm || 0);
        try {
          const list = r.deductionDetails ? JSON.parse(String(r.deductionDetails)) : [];
          if (Array.isArray(list)) {
            for (const d of list) {
              if (String(d?.name || '').trim().toLowerCase() === 'rider fee') cur.riderCharge += Number(d.amount) || 0;
            }
          }
        } catch {}
        riderMap.set(key, cur);
      }
      if (page.rows.length < PAGE) break;
    }
    const riderStats = Array.from(riderMap.values())
      .map(r => ({
        ...r,
        amount: Math.round(r.amount * 100) / 100,
        km: Math.round(r.km * 10) / 10,
        riderCharge: Math.round(r.riderCharge * 100) / 100,
      }))
      .sort((a, b) => b.orders - a.orders);

    const totalRevenue = Number(salesResult.rows[0]?.totalRevenue ?? 0);
    const totalDeductions = Number(salesResult.rows[0]?.totalDeductions ?? 0);
    const totalDiscounts = Number(salesResult.rows[0]?.totalDiscounts ?? 0);
    const totalPurchases = Number(purchasesResult.rows[0]?.totalPurchases ?? 0);
    const totalExpenses = Number(expensesResult.rows[0]?.totalExpenses ?? 0);
    const totalOtherIncome = Number(incomeResult.rows[0]?.totalOtherIncome ?? 0);

    // Delivery distance stats
    const deliveryParams: string[] = [];
    let deliveryBranchFilter = '';
    if (input.branchId) {
      deliveryBranchFilter = ` AND EXISTS (SELECT 1 FROM "BranchesSales" bds WHERE bds."salesId" = "Sales".id AND bds."branchesId" = $1)`;
      deliveryParams.push(input.branchId);
    }
    const deliveryResult = await zite.sql({
      query: `
        SELECT COUNT(*) AS cnt,
               COALESCE(AVG("deliveryDistanceKm"), 0) AS avg_dist,
               COALESCE(MAX("deliveryDistanceKm"), 0) AS max_dist,
               COALESCE(MIN("deliveryDistanceKm"), 0) AS min_dist
        FROM "Sales"
        WHERE "deliveryDistanceKm" IS NOT NULL AND "deliveryDistanceKm" > 0${deliveryBranchFilter}
      `,
      params: deliveryParams,
    });

    return {
      totalSales: Number(salesResult.rows[0]?.totalSales ?? 0),
      totalRevenue,
      totalOtherIncome,
      // Expenses = purchases + other expenses + sale deductions + discounts given
      totalExpenses: totalExpenses + totalPurchases + totalDeductions + totalDiscounts,
      totalDeductions,
      totalDiscounts,
      totalPurchases,
      // Profit = sales + other income - purchases - other expenses
      // Sales are counted before discounts and the discounts are an expense, so profit is unchanged by how they are shown.
      profitLoss: totalRevenue + totalOtherIncome - totalPurchases - totalExpenses - totalDeductions - totalDiscounts,
      stockValue: Number(stockResult.rows[0]?.stockValue ?? 0),
      topProducts: topProducts.rows.map(r => ({
        productName: String(r.productName ?? ''),
        totalSold: Number(r.totalSold ?? 0),
        revenue: Number(r.revenue ?? 0),
      })),
      topCustomers: topCustomers.rows.map(r => ({
        customerName: String(r.customerName ?? ''),
        phone: String(r.phone ?? ''),
        orderCount: Number(r.orderCount ?? 0),
        totalSpent: Number(r.totalSpent ?? 0),
      })),
      revenueByDay: revByDay.rows.map(r => ({
        date: String(r.date ?? ''),
        revenue: Number(r.revenue ?? 0),
      })),
      expensesByCategory: expByCat.rows.map(r => ({
        category: String(r.category ?? ''),
        amount: Number(r.amount ?? 0),
      })),
      deliveryStats: {
        totalDeliveries: Number(deliveryResult.rows[0]?.cnt ?? 0),
        avgDistanceKm: Math.round(Number(deliveryResult.rows[0]?.avg_dist ?? 0) * 10) / 10,
        longestKm: Number(deliveryResult.rows[0]?.max_dist ?? 0),
        shortestKm: Number(deliveryResult.rows[0]?.min_dist ?? 0),
      },
      riderStats,
    };
  },
});
