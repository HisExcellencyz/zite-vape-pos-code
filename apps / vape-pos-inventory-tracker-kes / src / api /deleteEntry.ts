import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { assertCan } from '../lib/permissions';
import { linkedIncomeIds } from '../lib/entryDates';

const firstId = (v: any) => (Array.isArray(v) ? v[0] : v) || null;

export default createEndpoint({
  description: 'Delete an entry on the Income or Expenses pages. Deleting a sale puts its items back in stock and removes its delivery fee / revenues; deleting a purchase takes its items out of stock and refunds a supplier deposit that paid for it. Deleting a deduction only clears the deductions on the sale.',
  authenticated: true,
  inputSchema: z.object({
    kind: z.enum(['sale', 'income', 'purchase', 'expense', 'deduction']),
    id: z.string(),
    /** Sales: put the sold quantities back in stock. Purchases: take the purchased quantities out of stock. */
    adjustStock: z.boolean().optional(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ input, context }) => {
    const adjust = input.adjustStock !== false;

    switch (input.kind) {
      case 'income': {
        await assertCan(context.user.id, 'income', 'delete');
        await zite.otherIncome.delete({ id: input.id });
        break;
      }
      case 'expense': {
        await assertCan(context.user.id, 'expenses', 'delete');
        await zite.otherExpenses.delete({ id: input.id });
        break;
      }
      case 'deduction': {
        await assertCan(context.user.id, 'expenses', 'delete');
        await zite.sales.update({ id: input.id, record: { deductions: 0, deductionDetails: null } });
        break;
      }
      case 'sale': {
        await assertCan(context.user.id, 'income', 'delete');
        const sale = await zite.sales.findOne({ id: input.id });
        if (!sale) throw new Error('Sale not found');
        const items = await zite.sql({
          query: `SELECT si.id AS "itemId", si."quantity" AS "quantity", p."productsId" AS "productId"
                  FROM "SaleItems" si
                  JOIN "SaleItemsSales" ls ON ls."saleItemsId" = si.id
                  LEFT JOIN "ProductsSaleItems" p ON p."saleItemsId" = si.id
                  WHERE ls."salesId" = $1`,
          params: [input.id],
        });
        for (const r of items.rows) {
          if (adjust && r.productId && sale.status !== 'Voided') {
            const prod = await zite.products.findOne({ id: String(r.productId) });
            if (prod) await zite.products.update({ id: prod.id, record: { stockQuantity: (prod.stockQuantity || 0) + Number(r.quantity || 0) } });
          }
          await zite.saleItems.delete({ id: String(r.itemId) });
        }
        for (const incId of await linkedIncomeIds(sale.saleNumber)) await zite.otherIncome.delete({ id: incId });
        await zite.sales.delete({ id: input.id });
        break;
      }
      case 'purchase': {
        await assertCan(context.user.id, ['expenses', 'purchases'], 'delete');
        const purchase = await zite.purchases.findOne({ id: input.id });
        if (!purchase) throw new Error('Purchase not found');
        const items = await zite.sql({
          query: `SELECT pi.id AS "itemId", pi."quantity" AS "quantity", p."productsId" AS "productId"
                  FROM "PurchaseItems" pi
                  JOIN "PurchaseItemsPurchases" lp ON lp."purchaseItemsId" = pi.id
                  LEFT JOIN "ProductsPurchaseItems" p ON p."purchaseItemsId" = pi.id
                  WHERE lp."purchasesId" = $1`,
          params: [input.id],
        });
        for (const r of items.rows) {
          if (adjust && r.productId) {
            const prod = await zite.products.findOne({ id: String(r.productId) });
            if (prod) await zite.products.update({ id: prod.id, record: { stockQuantity: Math.max(0, (prod.stockQuantity || 0) - Number(r.quantity || 0)) } });
          }
          await zite.purchaseItems.delete({ id: String(r.itemId) });
        }
        // Give a deposit-funded purchase back to the supplier's deposit balance.
        const supplierId = firstId(purchase.supplier);
        if (purchase.paymentType === 'From Deposit' && supplierId) {
          const supplier = await zite.suppliers.findOne({ id: supplierId });
          if (supplier) {
            const newBalance = (supplier.depositBalance || 0) + (purchase.total || 0);
            await zite.suppliers.update({ id: supplierId, record: { depositBalance: newBalance } });
            await zite.supplierTransactions.create({
              record: {
                supplier: supplierId,
                type: 'Deposit',
                amount: purchase.total || 0,
                runningBalance: newBalance,
                transactionDate: new Date().toISOString(),
                notes: `Refund: Purchase #${purchase.purchaseNumber ?? purchase.id} was deleted`,
              },
            });
          }
        }
        await zite.purchases.delete({ id: input.id });
        break;
      }
    }
    return { success: true };
  },
});
