import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { normalizePhone } from '../lib/phone';
import { archiveCustomerLocation } from '../lib/customerLocations';
import { findContactOwner, sameName } from '../lib/customerContacts';

export default createEndpoint({
  description: 'Create or update a customer (optionally with a map location); one customer per phone number and email',
  authenticated: true,
  inputSchema: z.object({
    id: z.string().optional(),
    phoneNumber: z.string().min(1),
    customerName: z.string().min(1),
    email: z.string().optional(),
    address: z.string().optional(),
    coordinates: z.string().optional(),
    notes: z.string().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    customer: z.any(),
    /** True when no new customer was made because this exact customer already existed (e.g. Save tapped twice). */
    existing: z.boolean().optional(),
  }),
  execute: async ({ input }) => {
    const phone = normalizePhone(input.phoneNumber);
    const name = input.customerName.trim();
    const email = (input.email || '').trim().toLowerCase();

    // One customer per phone number and per email, whatever format the number was typed in.
    const owner = await findContactOwner({ phone, email, excludeId: input.id });
    if (owner) {
      // The same name and number again (a double tap on Save, or re-adding a known customer): use that customer.
      if (!input.id && owner.by === 'phone' && sameName(owner.customer.customerName, name)) {
        const customer = await zite.customers.findOne({ id: owner.customer.id });
        return { success: true, customer, existing: true };
      }
      const what = owner.by === 'phone' ? `phone number ${owner.customer.phoneNumber || phone}` : `email ${email}`;
      throw new Error(`A customer with this ${owner.by === 'phone' ? 'phone number' : 'email'} already exists: ${owner.customer.customerName || 'unnamed'} (${what})`);
    }

    const record: Record<string, unknown> = {
      phoneNumber: phone,
      customerName: name,
      email: email || null,
      address: input.address || null,
    };
    // Notes are only changed when sent (the edit forms don't send them, and must not wipe them).
    if (input.notes !== undefined) record.notes = input.notes || null;
    if (input.coordinates) record.coordinates = input.coordinates;

    if (input.id) {
      // A different map location replaces the saved one; the old one is archived as a secondary location.
      const current = await zite.customers.findOne({ id: input.id });
      if (current && input.coordinates && input.coordinates !== current.coordinates) {
        await archiveCustomerLocation(input.id, { address: current.address, coordinates: current.coordinates, plusCode: current.plusCode });
      }
      const updated = await zite.customers.update({ id: input.id, record });
      return { success: true, customer: updated };
    }
    const created = await zite.customers.create({ record });
    return { success: true, customer: created };
  },
});
