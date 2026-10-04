import { zite } from 'zitejs/db';

const pad = (n: number) => String(n).padStart(2, '0');

/** Today's date (YYYY-MM-DD) in East African Time. */
export const todayEAT = () => new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
/** The EAT calendar day (YYYY-MM-DD) of an ISO timestamp. */
export const dayEAT = (iso: string) => new Date(new Date(iso).getTime() + 3 * 3600 * 1000).toISOString().slice(0, 10);

/** True when someone without backdate rights is trying to use a date other than today. */
export const isBackdated = (canBackdate: boolean, day?: string | null) => !canBackdate && !!day && day !== todayEAT();

// Accepts 2025-01-31, 31/01/2025, 31-01-2025 (day first), optionally with " HH:mm" (East Africa time).
export function parseEntryDate(s: string): { iso: string; day: string } | null {
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

/** Ids of the Other Income entries created together with a sale (delivery fee and other revenues). */
export async function linkedIncomeIds(saleNumber?: number | null): Promise<string[]> {
  if (saleNumber == null) return [];
  const r = await zite.sql({
    query: `SELECT id FROM "OtherIncome" WHERE "description" LIKE $1`,
    params: [`% - Sale #${saleNumber}`],
  });
  return r.rows.map(x => String(x.id));
}

/** Changes a sale's date and moves its linked revenue entries to the same date. */
export async function moveSaleDate(saleId: string, saleNumber: number | undefined | null, iso: string) {
  await zite.sales.update({ id: saleId, record: { saleDate: iso } });
  for (const id of await linkedIncomeIds(saleNumber)) {
    await zite.otherIncome.update({ id, record: { incomeDate: iso } });
  }
}
