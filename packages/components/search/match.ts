// Search matching shared by the browser and the endpoints (no React here, so endpoints can import it).

/** Lower case, no accents, single spaces. */
export const normText = (v: unknown) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Digits of a phone number in a comparable form: Kenyan numbers become their
 * last 9 digits whatever way they were typed (0712..., 712..., +254 712..., +UDP712...).
 */
export const phoneDigits = (v: unknown) => {
  let d = String(v ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('254')) d = d.slice(3);
  else if (d.length === 10 && d.startsWith('0')) d = d.slice(1);
  return d;
};

/**
 * True when every word of the query is found in at least one of the values.
 * Words can be in any order; case and accents are ignored. A word that is
 * mostly digits also matches phone numbers typed in any format.
 */
export function matchesQuery(values: unknown[], query: string): boolean {
  const words = normText(query).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const texts = values.map(v => normText(Array.isArray(v) ? v.join(' ') : v));
  const digits = values.map(v => String(v ?? '').replace(/\D/g, '')).filter(d => d.length >= 3);
  return words.every(w => {
    if (texts.some(t => t.includes(w))) return true;
    const wd = w.replace(/\D/g, '');
    if (wd.length < 3 || wd.length < w.replace(/[\s+\-()]/g, '').length) return false;
    // Typed with a leading 0 or 254 (0705…, 254705…): match on the part after it.
    const core = wd.length >= 10 ? phoneDigits(wd) : wd.replace(/^(254|0)/, '') || wd;
    return digits.some(d => d.includes(core) || phoneDigits(d).includes(core));
  });
}
