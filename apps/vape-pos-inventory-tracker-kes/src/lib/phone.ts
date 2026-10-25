/**
 * Puts a phone number in one standard shape so duplicates are caught and
 * Kenyan numbers always read +254XXXXXXXXX.
 *  "0712 345 678" / "712345678" / "254712345678" / "+UDP712345678" -> "+254712345678"
 * Numbers that already carry another country code are kept, minus spaces.
 */
export function normalizePhone(raw: string): string {
  let p = (raw || '').trim().replace(/[\s\-().]/g, '');
  if (!p) return '';
  p = p.replace(/^\+?UDP/i, '+254');
  if (p.startsWith('+')) {
    if (p.startsWith('+2540')) p = '+254' + p.slice(5);
    return p;
  }
  if (/^0[17]\d{8}$/.test(p)) return '+254' + p.slice(1);
  if (/^[17]\d{8}$/.test(p)) return '+254' + p;
  return '+' + p;
}
