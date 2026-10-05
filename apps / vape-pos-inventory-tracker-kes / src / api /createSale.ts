import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { assertCan } from '../lib/permissions';

export default createEndpoint({
  description: 'Create a POS sale with items. An optional delivery fee (and other incomes) is recorded as income; an optional rider is noted on the sale.',
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
  }),
  outputSchema: z.object({ success: z.boolean(), sale: z.any() }),
  execute: async ({ input, context }) => {
    await assertCan(context.user.id, 'pos', 'create');
    let subtotal = 0;
    let totalTax = 0;

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

    const sale = await zite.sales.create({
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
        deductions: (input.deductions || []).reduce((s, d) => s + d.amount, 0),
        deductionDetails: input.deductions?.length ? JSON.stringify(input.deductions) : null,
      },
    });

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

    // Deduct stock
    for (const item of input.items) {
      const product = await zite.products.findOne({ id: item.productId });
      if (product) {
        const newQty = Math.max(0, (product.stockQuantity || 0) - item.quantity);
        await zite.products.update({
          id: item.productId,
          record: { stockQuantity: newQty },
        });
      }
    }

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

    return { success: true, sale };
  },
});
