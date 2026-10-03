import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

// Bills owed to suppliers are kept in the app settings record (customFields.supplierBills),
// the same way held orders and riders are, so no new table is needed.

interface Bill {
  id: string;
  supplierId: string;
  amount: number;
  notes?: string | null;
  date: string;
  status: 'pending' | 'paid';
  source: 'manual' | 'pickup';
  items?: { productId: string; name: string; quantity: number; unitCost: number }[];
  saleNumber?: number | null;
  branchId?: string | null;
  createdBy?: string;
  paidAt?: string | null;
  paidFrom?: 'cash' | 'deposit' | null;
}

export default createEndpoint({
  description: 'List, add, pay or delete bills owed to suppliers. Bills can be added manually or automatically from POS pick-ups.',
  authenticated: true,
  inputSchema: z.object({
    action: z.enum(['list', 'add', 'pay', 'delete']),
    supplierId: z.string().optional(),
    billId: z.string().optional(),
    amount: z.number().optional(),
    notes: z.string().optional(),
    date: z.string().optional(),
    source: z.enum(['manual', 'pickup']).optional(),
    items: z.array(z.object({
      productId: z.string(),
      name: z.string(),
      quantity: z.number(),
      unitCost: z.number(),
    })).optional(),
    saleNumber: z.number().optional(),
    branchId: z.string().optional(),
    fromDeposit: z.boolean().optional(),
  }),
  outputSchema: z.object({ bills: z.array(z.any()), pending: z.number() }),
  execute: async ({ input, context }) => {
    let settings = await zite.businessSettings.findOne({});
    let cfg: any = {};
    try { if (settings?.customFields) cfg = JSON.parse(settings.customFields); } catch {}
    let bills: Bill[] = Array.isArray(cfg.supplierBills) ? cfg.supplierBills : [];

    const save = async () => {
      cfg.supplierBills = bills;
      const customFields = JSON.stringify(cfg);
      if (settings) {
        await zite.businessSettings.update({ id: settings.id, record: { customFields } });
      } else {
        settings = await zite.businessSettings.create({ record: { businessName: 'Uptown Vapes', customFields } });
      }
    };

    if (input.action === 'add') {
      if (!input.supplierId) throw new Error('Supplier is required');
      if (!(input.amount && input.amount > 0)) throw new Error('Enter a bill amount greater than 0');
      const supplier = await zite.suppliers.findOne({ id: input.supplierId });
      if (!supplier) throw new Error('Supplier not found');
      bills.push({
        id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        supplierId: input.supplierId,
        amount: Math.round(input.amount * 100) / 100,
        notes: input.notes || null,
        date: input.date || new Date().toISOString(),
        status: 'pending',
        source: input.source || 'manual',
        items: input.items,
        saleNumber: input.saleNumber ?? null,
        branchId: input.branchId || null,
        createdBy: context.user.email || context.user.id,
        paidAt: null,
        paidFrom: null,
      });
      await save();
    } else if (input.action === 'delete') {
      if (!input.billId) throw new Error('Bill is required');
      bills = bills.filter(b => b.id !== input.billId);
      await save();
    } else if (input.action === 'pay') {
      const bill = bills.find(b => b.id === input.billId);
      if (!bill) throw new Error('Bill not found');
      if (bill.status === 'paid') throw new Error('This bill is already paid');

      if (input.fromDeposit) {
        const supplier = await zite.suppliers.findOne({ id: bill.supplierId });
        if (!supplier) throw new Error('Supplier not found');
        const balance = supplier.depositBalance || 0;
        if (balance < bill.amount) {
          throw new Error(`Insufficient deposit balance. Available: KES ${balance.toLocaleString()}, bill: KES ${bill.amount.toLocaleString()}`);
        }
        const newBalance = balance - bill.amount;
        await zite.suppliers.update({ id: supplier.id, record: { depositBalance: newBalance } });
        await zite.supplierTransactions.create({
          record: {
            supplier: supplier.id,
            type: 'Purchase Deduction',
            amount: bill.amount,
            runningBalance: newBalance,
            transactionDate: new Date().toISOString(),
            notes: `Bill payment${bill.notes ? ': ' + bill.notes : ''}`,
          },
        });
      }
      bill.status = 'paid';
      bill.paidAt = new Date().toISOString();
      bill.paidFrom = input.fromDeposit ? 'deposit' : 'cash';
      await save();
    }

    const list = bills
      .filter(b => !input.supplierId || b.supplierId === input.supplierId)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const pending = list.filter(b => b.status === 'pending').reduce((s, b) => s + b.amount, 0);
    return { bills: list, pending };
  },
});
