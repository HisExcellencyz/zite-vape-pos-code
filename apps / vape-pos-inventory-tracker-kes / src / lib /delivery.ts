import { getSettings, saveSettings } from 'zitejs/api';

export interface Rider { id: string; name: string; phone?: string; notes?: string; }
export interface Riders { threePl: Rider[]; own: Rider[]; }
export type RiderType = 'threePl' | 'own';

export const DEFAULT_DELIVERY_FEE = 199;
/** Default rider fee per order (KES). Each outlet can set its own in Settings > Outlets. */
export const DEFAULT_RIDER_FEE = 0;
export const DELIVERY_FEE_PREFIX = 'Delivery fee';
export const RIDER_LABELS: Record<RiderType, string> = { threePl: '3PL Riders', own: 'Own Riders' };
const SHORT: Record<RiderType, string> = { threePl: '3PL', own: 'Own' };

/** Delivery fees are stored as Other Income entries whose description starts with this prefix. */
export const isDeliveryFeeIncome = (i: { description?: string }) => (i.description || '').startsWith(DELIVERY_FEE_PREFIX);

/** Text saved in a sale's notes so the rider can be shown later. */
export const riderNote = (type: RiderType, name: string) => `Rider (${SHORT[type]}): ${name}`;

/** Reads "Rider (3PL): Name" back out of a notes string. Returns '' when none. */
export function parseRider(notes?: string | null): string {
  const m = /Rider \((3PL|Own)\): ([^|]+)/.exec(notes || '');
  return m ? `${m[2].trim()} (${m[1]})` : '';
}

export const newRiderId = () => `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

/** Riders are shared by every outlet and kept in the app settings record. */
export async function loadRiders(): Promise<Riders> {
  const res = await getSettings({});
  const s = res.settings as any;
  let cfg: any = {};
  try { cfg = s?.customFields ? JSON.parse(s.customFields) : {}; } catch {}
  return {
    threePl: Array.isArray(cfg.riders?.threePl) ? cfg.riders.threePl : [],
    own: Array.isArray(cfg.riders?.own) ? cfg.riders.own : [],
  };
}

export async function persistRiders(riders: Riders) {
  const res = await getSettings({});
  const s = res.settings as any;
  await saveSettings({
    id: s?.id,
    businessName: s?.businessName || 'Uptown Vapes',
    customFields: JSON.stringify({ riders }),
  });
}
