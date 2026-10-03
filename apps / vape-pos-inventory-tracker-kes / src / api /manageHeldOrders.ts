import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description:
    'List, hold or remove on-hold (pending) POS orders. They are kept in the app settings record so every device and cashier sees the same pending orders.',
  authenticated: true,
  inputSchema: z.object({
    action: z.enum(['list', 'hold', 'remove']),
    branchId: z.string().optional(),
    id: z.string().optional(),
    order: z.any().optional(),
  }),
  outputSchema: z.object({ orders: z.array(z.any()) }),
  execute: async ({ input, context }) => {
    let settings = await zite.businessSettings.findOne({});
    let cfg: any = {};
    try { if (settings?.customFields) cfg = JSON.parse(settings.customFields); } catch {}
    let held: any[] = Array.isArray(cfg.heldOrders) ? cfg.heldOrders : [];

    const save = async () => {
      cfg.heldOrders = held;
      const customFields = JSON.stringify(cfg);
      if (settings) {
        await zite.businessSettings.update({ id: settings.id, record: { customFields } });
      } else {
        settings = await zite.businessSettings.create({ record: { businessName: 'Uptown Vapes', customFields } });
      }
    };

    if (input.action === 'hold') {
      if (!input.order) throw new Error('Nothing to hold');
      held = [
        ...held,
        {
          ...input.order,
          id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          heldAt: new Date().toISOString(),
          heldBy: context.user.email || '',
          branchId: input.branchId || null,
        },
      ];
      await save();
    } else if (input.action === 'remove') {
      if (!input.id) throw new Error('Order id is required');
      held = held.filter(h => h.id !== input.id);
      await save();
    }

    const orders = held
      .filter(h => !input.branchId || !h.branchId || h.branchId === input.branchId)
      .sort((a, b) => String(a.heldAt || '').localeCompare(String(b.heldAt || '')));
    return { orders };
  },
});
