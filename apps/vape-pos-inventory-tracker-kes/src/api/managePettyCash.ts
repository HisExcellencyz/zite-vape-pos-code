import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getAccess } from '../lib/permissions';
import { dayEAT, todayEAT } from '../lib/entryDates';
import { pettyCashBalances, fmtKes } from '../lib/pettyCash';

const first = (v?: string | string[] | null) => (Array.isArray(v) ? v[0] : v) || null;

export default createEndpoint({
  description: "List an outlet's petty cash, top it up, withdraw from it, or delete an entry. Supplier bills paid from petty cash are deducted here.",
  authenticated: true,
  inputSchema: z.object({
    action: z.enum(['list', 'topup', 'withdraw', 'delete']),
    branchId: z.string(),
    amount: z.number().optional(),
    description: z.string().optional(),
    notes: z.string().optional(),
    date: z.string().optional(),
    entryId: z.string().optional(),
  }),
  outputSchema: z.object({
    balance: z.number(),
    balances: z.record(z.number()),
    entries: z.array(z.any()),
  }),
  execute: async ({ input, context }) => {
    const access = await getAccess(context.user.id);
    const need = (action: string, what: string) => {
      if (!access.can('expenses', action)) throw new Error(`You do not have permission to ${what} petty cash. Ask an administrator to update your role.`);
    };

    if (input.action === 'list') need('view', 'view');

    if (input.action === 'topup' || input.action === 'withdraw') {
      need('create', input.action === 'topup' ? 'top up' : 'withdraw from');
      const amount = Math.round((input.amount || 0) * 100) / 100;
      if (!(amount > 0)) throw new Error('Enter an amount greater than 0');
      const branch = await zite.branches.findOne({ id: input.branchId });
      if (!branch) throw new Error('Outlet not found');
      if (input.action === 'withdraw') {
        const bal = (await pettyCashBalances())[input.branchId] || 0;
        if (bal < amount) throw new Error(`Not enough petty cash. Available: ${fmtKes(bal)}`);
      }
      let entryDate = new Date().toISOString();
      if (input.date) {
        const d = new Date(input.date);
        if (!isNaN(d.getTime()) && dayEAT(d.toISOString()) !== todayEAT()) {
          if (!access.canBackdate) throw new Error('Only the Owner and Admin can create backdated entries');
          entryDate = d.toISOString();
        }
      }
      await zite.pettyCash.create({
        record: {
          entryDate,
          type: input.action === 'topup' ? 'Top Up' : 'Withdrawal',
          amount: input.action === 'topup' ? amount : -amount,
          description: input.description?.trim() || (input.action === 'topup' ? 'Petty cash top-up' : 'Petty cash withdrawal'),
          branch: input.branchId,
          supplier: null,
          billId: null,
          notes: input.notes || null,
          createdBy: context.user.id,
        },
      });
    }

    if (input.action === 'delete') {
      need('delete', 'delete');
      if (!input.entryId) throw new Error('Entry is required');
      const entry = await zite.pettyCash.findOne({ id: input.entryId });
      if (!entry) throw new Error('Entry not found');
      if (entry.type === 'Bill Payment') throw new Error('This is a supplier bill payment. Delete the bill on the supplier instead; its petty cash is returned automatically.');
      await zite.pettyCash.delete({ id: entry.id });
    }

    const balances = await pettyCashBalances();
    const { records } = await zite.pettyCash.findAll({ limit: 2000, sort: [{ field: 'entryDate', direction: 'desc' }] });
    const mine = records.filter(r => first(r.branch) === input.branchId);

    // Running balance after each entry (entries are newest first)
    let running = balances[input.branchId] || 0;
    const entries = mine.map(r => {
      const row = { ...r, branch: first(r.branch), supplier: first(r.supplier), runningBalance: Math.round(running * 100) / 100 };
      running -= r.amount || 0;
      return row;
    });

    return { balance: balances[input.branchId] || 0, balances, entries };
  },
});
