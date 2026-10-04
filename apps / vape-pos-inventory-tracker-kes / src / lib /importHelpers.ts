import { todayEat } from './dates';

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
export const normRow = (r: Record<string, string>) => {
  const o: Record<string, string> = {};
  for (const [k, v] of Object.entries(r)) o[norm(k)] = String(v ?? '').trim();
  return o;
};
export const parseNum = (s: string) => {
  const n = Number(String(s).replace(/,/g, '').replace(/^KES\s*/i, ''));
  return Number.isFinite(n) ? n : NaN;
};
const pad = (n: number) => String(n).padStart(2, '0');

// Accepts 2025-01-31, 31/01/2025, 31-01-2025 (day first), optionally with " HH:mm" (East Africa time).
export function parseDate(s: string): { iso: string; day: string } | null {
  const v = (s || '').trim();
  if (!v) return null;
  let y: number, mo: number, d: number, h: number | null = null, mi = 0;
  let m = v.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) {
    y = +m[1]; mo = +m[2]; d = +m[3];
    if (m[4]) { h = +m[4]; mi = +m[5]; }
  } else {
    m = v.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?/);
    if (!m) return null;
    d = +m[1]; mo = +m[2]; y = +m[3];
    if (y < 100) y += 2000;
    if (m[4]) { h = +m[4]; mi = +m[5]; }
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  if (new Date(Date.UTC(y, mo - 1, d)).getUTCDate() !== d) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d, h === null ? 12 : h - 3, mi));
  return { iso: dt.toISOString(), day: `${y}-${pad(mo)}-${pad(d)}` };
}

/** True when the day is anything other than today (East Africa time). */
export const isBackdated = (day: string) => day !== todayEat();

export const BACKDATE_MSG = 'only the Owner and Admin can import backdated entries or change dates';
