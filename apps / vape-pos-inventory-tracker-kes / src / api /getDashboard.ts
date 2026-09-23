import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Dashboard statistics with period filtering',
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

    // Total sales & revenue
    const salesResult = await zite.sql({
      query: `
        SELECT COUNT(DISTINCT s.id) AS "totalSales",
               COALESCE(SUM(s."total"), 0) AS "totalRevenue"
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

    const incomeResult = await zite.sql({
      query: `
        SELECT COALESCE(SUM(i."amount"), 0) AS "totalOtherIncome"
        FROM "OtherIncome" i
        WHERE 1=1${incDateFilter}
      `,
      params: incParams,
    });

    // Stock value
    const stockResult = await zite.sql({
      query: `
        SELECT COALESCE(SUM("costPrice" * "stockQuantity"), 0) AS "stockValue"
        FROM "Products"
        WHERE "status" = 'Active'
      `,
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
        LIMIT 10
      `,
      params,
    });

    // Revenue by day (last 30 days default)
    const revByDay = await zite.sql({
      query: `
        SELECT to_char(s."saleDate", 'YYYY-MM-DD') AS date,
               COALESCE(SUM(s."total"), 0) AS revenue
        FROM "Sales" s
        WHERE s."status" = 'Completed'
          AND s."saleDate" IS NOT NULL
          AND s."saleDate" >= now() - interval '30 days'${dateFilter}
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

    const totalRevenue = Number(salesResult.rows[0]?.totalRevenue ?? 0);
    const totalPurchases = Number(purchasesResult.rows[0]?.totalPurchases ?? 0);
    const totalExpenses = Number(expensesResult.rows[0]?.totalExpenses ?? 0);
    const totalOtherIncome = Number(incomeResult.rows[0]?.totalOtherIncome ?? 0);

    // Delivery distance stats
    const deliveryResult = await zite.sql({
      query: `
        SELECT COUNT(*) AS cnt,
               COALESCE(AVG("deliveryDistanceKm"), 0) AS avg_dist,
               COALESCE(MAX("deliveryDistanceKm"), 0) AS max_dist,
               COALESCE(MIN("deliveryDistanceKm"), 0) AS min_dist
        FROM "Sales"
        WHERE "deliveryDistanceKm" IS NOT NULL AND "deliveryDistanceKm" > 0
      `,
    });

    return {
      totalSales: Number(salesResult.rows[0]?.totalSales ?? 0),
      totalRevenue,
      totalOtherIncome,
      totalExpenses: totalExpenses + totalPurchases,
      totalPurchases,
      // Profit = sales + other income - purchases - other expenses
      profitLoss: totalRevenue + totalOtherIncome - totalPurchases - totalExpenses,
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
    };
  },
});
