import { zite } from 'zitejs/db';
import { normText, phoneDigits } from '@project/components/search/match';

export interface ContactOwner { id: string; customerName: string; phoneNumber: string; email: string }

/** Comparable form of a phone number: its digits, with Kenyan numbers reduced to the last 9 (0712…, +254 712…, +UDP712… are one number). */
export const phoneKey = (phone?: string | null) => {
  const d = phoneDigits(phone);
  return d.length >= 7 ? d : '';
};

/** All customers' contacts, for matching many rows at once (imports). */
export async function loadContacts(): Promise<ContactOwner[]> {
  const { rows } = await zite.sql({ query: `SELECT id, "customerName", "phoneNumber", "email" FROM "Customers"` });
  return rows.map(r => ({ id: String(r.id), customerName: String(r.customerName || ''), phoneNumber: String(r.phoneNumber || ''), email: String(r.email || '') }));
}

/**
 * The customer who already has this phone number or email (other than `excludeId`), or null.
 * Phone numbers match whatever format they were typed in; emails ignore case.
 */
export function findContactOwnerIn(
  contacts: ContactOwner[],
  { phone, email, excludeId }: { phone?: string | null; email?: string | null; excludeId?: string },
): { by: 'phone' | 'email'; customer: ContactOwner } | null {
  const pk = phoneKey(phone);
  const em = (email || '').trim().toLowerCase();
  for (const c of contacts) {
    if (c.id === excludeId) continue;
    if (pk && phoneKey(c.phoneNumber) === pk) return { by: 'phone', customer: c };
  }
  if (em) {
    for (const c of contacts) {
      if (c.id === excludeId) continue;
      if (c.email.trim().toLowerCase() === em) return { by: 'email', customer: c };
    }
  }
  return null;
}

export async function findContactOwner(args: { phone?: string | null; email?: string | null; excludeId?: string }) {
  return findContactOwnerIn(await loadContacts(), args);
}

/** Same person typed again: same name, ignoring case, accents and spacing. */
export const sameName = (a?: string | null, b?: string | null) => normText(a) === normText(b) && normText(a) !== '';
