// East Africa Time (UTC+3) helpers shared by the server endpoints and the pages.
export const EAT_MS = 3 * 3600 * 1000;

/** YYYY-MM-DD of a moment, as read on an East African clock. */
export const eatDay = (d: Date | string) => new Date(new Date(d).getTime() + EAT_MS).toISOString().slice(0, 10);

export const todayEat = () => eatDay(new Date());

/** Builds an ISO timestamp for the given EAT day, keeping the time of day of an existing entry (noon if none). */
export function composeDate(day: string, existingIso?: string | null): string {
  let hhmm = '12:00';
  if (existingIso) hhmm = new Date(new Date(existingIso).getTime() + EAT_MS).toISOString().slice(11, 16);
  return new Date(`${day}T${hhmm}:00+03:00`).toISOString();
}
