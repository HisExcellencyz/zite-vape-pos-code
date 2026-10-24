import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Get supplier transactions and deposits',
  authenticated: true,
  inputSchema: z.object({
    supplierId: z.string(),
  }),
  outputSchema: z.object({
    supplier: z.any(),
    transactions: z.array(z.any()),
    deposits: z.array(z.any()),
  }),
  execute: async ({ input }) => {
    const supplier = await zite.suppliers.findOne({ id: input.supplierId });
    if (!supplier) throw new Error('Supplier not found');

    const txResult = await zite.sql({
      query: `
        SELECT st.id, st."type", st."amount", st."runningBalance", st."transactionDate", st."notes"
        FROM "SupplierTransactions" st
        JOIN "SupplierTransactionsSuppliers" l ON l."supplierTransactionsId" = st.id
        WHERE l."suppliersId" = $1
        ORDER BY st."transactionDate" DESC
        LIMIT 100
      `,
      params: [input.supplierId],
    });

    const depResult = await zite.sql({
      query: `
        SELECT sd.id, sd."amount", sd."date", sd."notes"
        FROM "SupplierDeposits" sd
        JOIN "SupplierDepositsSuppliers" l ON l."supplierDepositsId" = sd.id
        WHERE l."suppliersId" = $1
        ORDER BY sd."date" DESC
        LIMIT 100
      `,
      params: [input.supplierId],
    });

    return {
      supplier,
      transactions: txResult.rows.map(r => ({
        id: String(r.id),
        type: String(r.type || ''),
        amount: Number(r.amount || 0),
        runningBalance: Number(r.runningBalance || 0),
        transactionDate: r.transactionDate ? String(r.transactionDate) : null,
        notes: r.notes ? String(r.notes) : null,
      })),
      deposits: depResult.rows.map(r => ({
        id: String(r.id),
        amount: Number(r.amount || 0),
        date: r.date ? String(r.date) : null,
        notes: r.notes ? String(r.notes) : null,
      })),
    };
  },
});
