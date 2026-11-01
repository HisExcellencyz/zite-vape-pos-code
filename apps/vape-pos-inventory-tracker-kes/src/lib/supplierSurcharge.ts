// Small-order charge some suppliers add, and bill pricing from items.
// Shared by the Suppliers page (live totals) and manageSupplierBills (the saved amount).
// No database imports here, so the browser can use it too.

/** A supplier's rule: orders with fewer than `minPieces` pieces pay `perPiece` extra for every piece. */
export interface SurchargeRule {
  minPieces: number;
  perPiece: number;
}

export interface BillItem {
  productId: string;
  name: string;
  quantity: number;
  /** Cost price per piece. */
  unitCost: number;
}

/** True when the rule actually charges something. */
export const ruleIsActive = (r?: SurchargeRule | null): r is SurchargeRule =>
  !!r && r.minPieces > 0 && r.perPiece > 0;

/**
 * All pieces in the order are counted together. Below the minimum, every piece is charged:
 * minimum 10 and KES 50 per piece, 9 pieces → 9 × 50 = KES 450; 10 or more pieces → nothing.
 */
export function smallOrderCharge(rule: SurchargeRule | null | undefined, items: { quantity: number }[]) {
  const pieces = items.reduce((s, i) => s + Math.max(0, Number(i.quantity) || 0), 0);
  const amount = ruleIsActive(rule) && pieces > 0 && pieces < rule.minPieces ? pieces * rule.perPiece : 0;
  return { pieces, amount: round2(amount) };
}

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Items total (quantity × cost price), the small-order charge and the bill amount. */
export function priceBill(rule: SurchargeRule | null | undefined, items: BillItem[]) {
  const itemsTotal = round2(items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unitCost) || 0), 0));
  const charge = smallOrderCharge(rule, items);
  return {
    itemsTotal,
    pieces: charge.pieces,
    surcharge: charge.amount,
    amount: round2(itemsTotal + charge.amount),
    /** e.g. "9 pcs × KES 50 (orders under 10 pcs)" */
    surchargeNote: charge.amount > 0 && rule
      ? `${charge.pieces} pcs × KES ${rule.perPiece.toLocaleString()} (orders under ${rule.minPieces} pcs)`
      : null,
  };
}

/** Cleans up items sent by the browser: real quantities only, no negative costs. */
export function cleanItems(items: BillItem[] | undefined): BillItem[] {
  return (items || [])
    .map(i => ({
      productId: String(i.productId || ''),
      name: String(i.name || 'Item'),
      quantity: Math.max(0, Math.round(Number(i.quantity) || 0)),
      unitCost: Math.max(0, round2(Number(i.unitCost) || 0)),
    }))
    .filter(i => i.quantity > 0);
}
