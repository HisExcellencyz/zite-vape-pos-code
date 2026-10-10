import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { assertCan } from '../lib/permissions';
import { deductStock } from '../lib/storages';

// Orders merged into one delivery are saved with the note "Merged delivery with Sale #n" (n = the active order).
const MERGED = /^Merged delivery with Sale #(\d+)/;
// Any merged order (even if the active order's number was not known) never carries the Rider Fee.
const MERGED_ANY = /^Merged delivery/;
const isRiderFee = (name: string) => name.trim().toLowerCase() === 'rider fee';

/** Rewrites the "Bundled with: Sale #a, Sale #b" part of a notes string, keeping every other note part. */
const bundleNotes = (notes: string | null | undefined, others: number[]) => {
  const parts = (notes || '')
    .split(' | ')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('Bundled with:') && !s.startsWith('Merged delivery'));
  if (others.length > 0) parts.push('Bundled with: ' + others.map(n => `Sale #${n}`).join(', '));
  return parts.join(' | ') || null;
};

export default createEndpoint({
  description: 'Create a POS sale with items. An optional delivery fee (and other incomes) is recorded as income; an optional rider is noted on the sale. Stock is deducted from the right storage (see deductStock). Merged orders carry no Rider Fee (only the active order does) and every order of a bundle lists the others in its notes.',
  authenticated: true,
  inputSchema: z.object({
    items: z.array(z.object({
      productId: z.string(),
      quantity: z.number().min(1),
      unitPrice: z.number(),
      discount: z.number().optional(),
      taxAmount: z.number().optional(),
    })),
    customerId: z.string().optional(),
    paymentMethod: z.string(),
    discount: z.number().optional(),
    notes: z.string().optional(),
    branchId: z.string().optional(),
    pickupPoint: z.string().optional(),
    deliveryAddress: z.string().optional(),
    deliveryCoordinates: z.string().optional(),
    stops: z.string().optional(),
    deliveryDistanceKm: z.number().optional(),
    deductions: z.array(z.object({ name: z.string(), amount: z.number() })).optional(),
    deliveryFee: z.number().min(0).optional(),
    extraIncomes: z.array(z.object({ name: z.string(), amount: z.number().min(0) })).optional(),
    riderType: z.enum(['threePl', 'own']).optional(),
    riderName: z.string().optional(),
    /** Id of the Own Rider handling the order (his storage is used when he has the products). */
    riderId: z.string().optional(),
    /** Products ticked as picked up from a supplier: they never entered stock, so no storage is deducted. */
    supplierPickedProductIds: z.array(z.string()).optional(),
    /** Products ticked as picked up at a Storage location: { [storageId]: productIds }. They are deducted from that storage. */
    storagePicks: z.record(z.array(z.string())).optional(),
  }),
  outputSchema: z.object({ success: z.boolean(), sale: z.any() }),
  execute: async ({ input, context }) => {
    await assertCan(context.user.id, 'pos', 'create');
    let subtotal = 0;
    let totalTax = 0;

    const noteText = (input.notes || '').trim();
    const mergedMatch = MERGED.exec(noteText);
    const isMerged = MERGED_ANY.test(noteText);
    // Only the active order carries the Rider Fee: it is switched off on every merged order.
    const deductionList = (input.deductions || []).filter(d => !(isMerged && isRiderFee(d.name)));

    const lineItems = input.items.map(item => {
      const lineTotal = item.unitPrice * item.quantity - (item.discount || 0);
      subtotal += lineTotal;
      totalTax += item.taxAmount || 0;
      return { ...item, lineTotal };
    });

    const total = subtotal - (input.discount || 0);
    const saleDate = new Date().toISOString();

    const riderText = input.riderType && input.riderName
      ? `Rider (${input.riderType === 'threePl' ? '3PL' : 'Own'}): ${input.riderName}`
      : '';
    const notes = [input.notes, riderText].filter(Boolean).join(' | ') || null;

    let sale: any = await zite.sales.create({
      record: {
        saleDate,
        customer: input.customerId || null,
        branch: input.branchId || null,
        paymentMethod: input.paymentMethod,
        subtotal,
        taxAmount: totalTax,
        discount: input.discount || 0,
        total,
        status: 'Completed',
        notes,
        createdBy: context.user.id,
        pickupPoint: input.pickupPoint || null,
        deliveryAddress: input.deliveryAddress || null,
        deliveryCoordinates: input.deliveryCoordinates || null,
        stops: input.stops || null,
        deliveryDistanceKm: input.deliveryDistanceKm || null,
        deductions: deductionList.reduce((s, d) => s + d.amount, 0),
        deductionDetails: deductionList.length ? JSON.stringify(deductionList) : null,
      },
    });

    // The sale number is an autonumber: make sure we have it (the create call may not return it),
    // because the POS uses it to link merged orders to the active one.
    if (sale.saleNumber == null) {
      try {
        const again = await zite.sales.findOne({ id: sale.id });
        if (again) sale = again;
      } catch {}
    }

    // Create sale items
    const saleItemRecords = lineItems.map(item => ({
      sale: sale.id,
      product: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      taxAmount: item.taxAmount || 0,
      discount: item.discount || 0,
      lineTotal: item.lineTotal,
    }));

    if (saleItemRecords.length > 0) {
      await zite.saleItems.bulkCreate({ records: saleItemRecords });
    }

    // Deduct stock: Office by default, the assigned Own Rider's storage when he has the products,
    // a Storage pick-up's storage for items ticked there, and nothing for items picked up from suppliers.
    await deductStock(
      input.items.map(i => ({ productId: i.productId, quantity: i.quantity })),
      {
        supplierPicked: input.supplierPickedProductIds,
        storagePicks: input.storagePicks,
        riderId: input.riderType === 'own' ? input.riderId : undefined,
      },
    );

    // Delivery fee: always income. Stored as an Other Income entry (description starts with
    // "Delivery fee") so the dashboard and profit figures pick it up automatically.
    if ((input.deliveryFee || 0) > 0) {
      await zite.otherIncome.create({
        record: {
          incomeDate: saleDate,
          description: `Delivery fee - Sale #${sale.saleNumber ?? ''}`.trim(),
          amount: input.deliveryFee,
          branch: input.branchId || null,
          notes: riderText || null,
          createdBy: context.user.id,
        },
      });
    }

    // Any other incomes & revenues set up for the outlet (Settings > Outlets) are also recorded as Other Income,
    // named after the income so they can be told apart.
    for (const inc of input.extraIncomes || []) {
      if (!(inc.amount > 0)) continue;
      await zite.otherIncome.create({
        record: {
          incomeDate: saleDate,
          description: `${inc.name} - Sale #${sale.saleNumber ?? ''}`.trim(),
          amount: inc.amount,
          branch: input.branchId || null,
          notes: riderText || null,
          createdBy: context.user.id,
        },
      });
    }

    // Bundled orders: the active order, this order and every earlier merged order of the same checkout
    // each get a "Bundled with: Sale #..." note listing all the others.
    const mine = Number(sale.saleNumber);
    if (mergedMatch && Number.isFinite(mine)) {
      try {
        const activeNo = Number(mergedMatch[1]);
        const active = await zite.sql({
          query: `SELECT id, "saleNumber", "notes" FROM "Sales" WHERE "saleNumber" = $1`,
          params: [activeNo],
        });
        const siblings = await zite.sql({
          query: `SELECT id, "saleNumber", "notes" FROM "Sales" WHERE "notes" LIKE $1`,
          params: [`%Bundled with:%Sale #${activeNo}%`],
        });
        const linkRe = new RegExp(`Bundled with:[^|]*Sale #${activeNo}(?!\\d)`);
        const members = new Map<number, { id: string; notes: string | null }>();
        for (const r of active.rows) members.set(Number(r.saleNumber), { id: String(r.id), notes: r.notes ? String(r.notes) : null });
        for (const r of siblings.rows) {
          if (linkRe.test(String(r.notes || ''))) members.set(Number(r.saleNumber), { id: String(r.id), notes: r.notes ? String(r.notes) : null });
        }
        members.set(mine, { id: sale.id, notes });
        const numbers = Array.from(members.keys()).sort((a, b) => a - b);
        for (const [num, m] of members) {
          await zite.sales.update({
            id: m.id,
            record: { notes: bundleNotes(m.notes, numbers.filter(n => n !== num)) },
          });
        }
      } catch (e) {
        console.error('Could not link bundled sales', e);
      }
    }

    return { success: true, sale };
  },
});
