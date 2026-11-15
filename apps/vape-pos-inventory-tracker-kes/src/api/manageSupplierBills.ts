import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { pettyCashBalance } from '../lib/pettyCash';
import { assertCan } from '../lib/permissions';
import { SurchargeRule, BillItem, priceBill, cleanItems, ruleIsActive, round2 } from '../lib/supplierSurcharge';

// Bills owed to suppliers are kept in the app settings record (customFields.supplierBills),
// the same way held orders and riders are, so no new table is needed.
// Each supplier's small-order charge rule is kept next to them (customFields.supplierSurcharges[supplierId]).
// A bill with items is priced here: items total (quantity × cost price) + the small-order charge.

interface Bill {
  id: string;
  supplierId: string;
  amount: number;
  notes?: string | null;
  date: string;
  status: 'pending' | 'paid';
  source: 'manual' | 'pickup';
  items?: BillItem[];
  /** Items total before the small-order charge (bills with items only). */
  itemsTotal?: number | null;
  /** Small-order charge added to this bill, and how it was worked out. */
  surcharge?: number | null;
  surchargeNote?: string | null;
  saleNumber?: number | null;
  branchId?: string | null;
  createdBy?: string;
  paidAt?: string | null;
  paidFrom?: 'cash' | 'deposit' | 'pettycash' | null;
  pettyCashBranchId?: string | null;
}

export default createEndpoint({
  description: 'List, add, edit, pay or delete bills owed to suppliers, and set each supplier\'s small-order charge. Bills can be added manually or automatically from POS pick-ups.',
  authenticated: true,
  inputSchema: z.object({
    action: z.enum(['list', 'add', 'addMany', 'update', 'pay', 'delete', 'setRule']),
    /** setRule: orders with fewer than minPieces pieces pay perPiece extra for every piece (0 turns it off). */
    minPieces: z.number().optional(),
    perPiece: z.number().optional(),
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
    /** Pay the bill from this outlet's petty cash (deducts the petty cash balance). */
    fromPettyCash: z.boolean().optional(),
    pettyCashBranchId: z.string().optional(),
    /** addMany: several bills saved in one go (e.g. every supplier pick-up on one sale). */
    bills: z.array(z.object({
      supplierId: z.string(),
      amount: z.number(),
      notes: z.string().optional(),
      date: z.string().optional(),
      source: z.enum(['manual', 'pickup']).optional(),
      items: z.array(z.object({ productId: z.string(), name: z.string(), quantity: z.number(), unitCost: z.number() })).optional(),
      saleNumber: z.number().optional(),
      branchId: z.string().optional(),
    })).optional(),
  }),
  outputSchema: z.object({
    bills: z.array(z.any()),
    pending: z.number(),
    /** addMany: how many bills were saved, and the supplier ids that were skipped. */
    added: z.number().optional(),
    skipped: z.array(z.string()).optional(),
    /** The supplier's small-order charge rule (when supplierId is given), or null when it has none. */
    rule: z.object({ minPieces: z.number(), perPiece: z.number() }).nullable().optional(),
  }),
  execute: async ({ input, context }) => {
    let settings = await zite.businessSettings.findOne({});
    let cfg: any = {};
    try { if (settings?.customFields) cfg = JSON.parse(settings.customFields); } catch {}
    let bills: Bill[] = Array.isArray(cfg.supplierBills) ? cfg.supplierBills : [];
    const rules: Record<string, SurchargeRule> = cfg.supplierSurcharges && typeof cfg.supplierSurcharges === 'object' ? cfg.supplierSurcharges : {};
    const ruleOf = (supplierId: string) => (ruleIsActive(rules[supplierId]) ? rules[supplierId] : null);

    /** Amount and breakdown of a bill: priced from its items when it has any, otherwise the amount typed in. */
    const pricing = (supplierId: string, items: BillItem[], typedAmount?: number) => {
      if (items.length > 0) {
        const p = priceBill(ruleOf(supplierId), items);
        return { amount: p.amount, items, itemsTotal: p.itemsTotal, surcharge: p.surcharge || null, surchargeNote: p.surchargeNote };
      }
      return { amount: round2(typedAmount || 0), items: undefined, itemsTotal: null, surcharge: null, surchargeNote: null };
    };

    const save = async () => {
      cfg.supplierBills = bills;
      cfg.supplierSurcharges = rules;
      const customFields = JSON.stringify(cfg);
      if (settings) {
        await zite.businessSettings.update({ id: settings.id, record: { customFields } });
      } else {
        settings = await zite.businessSettings.create({ record: { businessName: 'Uptown Vapes', customFields } });
      }
    };

    let added: number | undefined;
    let skipped: string[] | undefined;

    if (input.action === 'addMany') {
      const wanted = input.bills || [];
      const ids = [...new Set(wanted.map(b => b.supplierId))];
      const found = await Promise.all(ids.map(id => zite.suppliers.findOne({ id }).catch(() => null)));
      const known = new Set(found.filter(Boolean).map(s => s!.id));
      added = 0;
      skipped = [];
      for (const b of wanted) {
        // POS pick-ups send their items: the bill is priced here, small-order charge included.
        const priced = pricing(b.supplierId, cleanItems(b.items), b.amount);
        if (!known.has(b.supplierId) || !(priced.amount > 0)) { skipped.push(b.supplierId); continue; }
        bills.push({
          id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          supplierId: b.supplierId,
          ...priced,
          notes: b.notes || null,
          date: b.date || new Date().toISOString(),
          status: 'pending',
          source: b.source || 'manual',
          saleNumber: b.saleNumber ?? null,
          branchId: b.branchId || null,
          createdBy: context.user.email || context.user.id,
          paidAt: null,
          paidFrom: null,
        });
        added++;
      }
      if (added > 0) await save();
    } else if (input.action === 'setRule') {
      if (!input.supplierId) throw new Error('Supplier is required');
      await assertCan(context.user.id, 'suppliers', 'edit');
      const minPieces = Math.max(0, Math.round(Number(input.minPieces) || 0));
      const perPiece = Math.max(0, round2(Number(input.perPiece) || 0));
      // Setting either number to 0 turns the charge off. Bills already recorded keep their amounts.
      if (minPieces > 0 && perPiece > 0) rules[input.supplierId] = { minPieces, perPiece };
      else delete rules[input.supplierId];
      await save();
    } else if (input.action === 'add') {
      if (!input.supplierId) throw new Error('Supplier is required');
      const priced = pricing(input.supplierId, cleanItems(input.items), input.amount);
      if (!(priced.amount > 0)) throw new Error('Add items with cost prices, or enter a bill amount greater than 0');
      const supplier = await zite.suppliers.findOne({ id: input.supplierId });
      if (!supplier) throw new Error('Supplier not found');
      bills.push({
        id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        supplierId: input.supplierId,
        ...priced,
        notes: input.notes || null,
        date: input.date || new Date().toISOString(),
        status: 'pending',
        source: input.source || 'manual',
        saleNumber: input.saleNumber ?? null,
        branchId: input.branchId || null,
        createdBy: context.user.email || context.user.id,
        paidAt: null,
        paidFrom: null,
      });
      await save();
    } else if (input.action === 'update') {
      // Change a pending bill's items, cost prices, amount, notes or date. Paid bills are left alone.
      await assertCan(context.user.id, 'suppliers', 'edit');
      const bill = bills.find(b => b.id === input.billId);
      if (!bill) throw new Error('Bill not found');
      if (bill.status === 'paid') throw new Error('This bill is already paid and can no longer be changed');
      const items = input.items !== undefined ? cleanItems(input.items) : (bill.items || []);
      const priced = pricing(bill.supplierId, items, input.amount ?? bill.amount);
      if (!(priced.amount > 0)) throw new Error('Add items with cost prices, or enter a bill amount greater than 0');
      Object.assign(bill, priced);
      if (input.notes !== undefined) bill.notes = input.notes || null;
      if (input.date) bill.date = input.date;
      await save();
    } else if (input.action === 'delete') {
      if (!input.billId) throw new Error('Bill is required');
      const gone = bills.find(b => b.id === input.billId);
      // A bill paid from petty cash gives the money back to petty cash when it is deleted
      if (gone?.status === 'paid' && gone.paidFrom === 'pettycash') {
        const res = await zite.sql({ query: `SELECT id FROM "PettyCash" WHERE "billId" = $1`, params: [gone.id] });
        for (const r of res.rows) await zite.pettyCash.delete({ id: String(r.id) });
      }
      bills = bills.filter(b => b.id !== input.billId);
      await save();
    } else if (input.action === 'pay') {
      const bill = bills.find(b => b.id === input.billId);
      if (!bill) throw new Error('Bill not found');
      if (bill.status === 'paid') throw new Error('This bill is already paid');

      if (input.fromDeposit && input.fromPettyCash) throw new Error('Choose either the deposit or petty cash, not both');

      if (input.fromPettyCash) {
        const branchId = input.pettyCashBranchId || bill.branchId;
        if (!branchId) throw new Error('Choose the outlet whose petty cash pays this bill');
        const balance = await pettyCashBalance(branchId);
        if (balance < bill.amount) {
          throw new Error(`Not enough petty cash. Available: KES ${balance.toLocaleString()}, bill: KES ${bill.amount.toLocaleString()}`);
        }
        const supplier = await zite.suppliers.findOne({ id: bill.supplierId });
        await zite.pettyCash.create({
          record: {
            entryDate: new Date().toISOString(),
            type: 'Bill Payment',
            amount: -bill.amount,
            description: `Bill payment - ${supplier?.supplierName || 'Supplier'}`,
            branch: branchId,
            supplier: bill.supplierId,
            billId: bill.id,
            notes: bill.notes || null,
            createdBy: context.user.id,
          },
        });
        bill.pettyCashBranchId = branchId;
      }

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
      bill.paidFrom = input.fromDeposit ? 'deposit' : input.fromPettyCash ? 'pettycash' : 'cash';
      await save();
    }

    const list = bills
      .filter(b => !input.supplierId || b.supplierId === input.supplierId)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const pending = list.filter(b => b.status === 'pending').reduce((s, b) => s + b.amount, 0);
    return { bills: list, pending, added, skipped, rule: input.supplierId ? ruleOf(input.supplierId) : undefined };
  },
});