// Pure storage helpers shared by the browser and the endpoints (no imports, no database access).
//
// Model: a product's total stock is `stockQuantity` (unchanged, so purchases, imports, bulk edits etc. keep working).
// Every storage EXCEPT the Office keeps its own explicit quantity (StockMap). The Office is the remainder:
//   Office quantity = total stock - sum of every other storage's quantity.

export const OFFICE_ID = 'office';

/** { [storageId]: { [productId]: quantity } } — the Office is never stored here, it is derived. */
export type StockMap = Record<string, Record<string, number>>;

export interface StorageLite {
  id: string;
  name: string;
  type: 'office' | 'custom' | 'rider';
  riderId?: string | null;
}

export const othersTotal = (stock: StockMap | undefined, productId: string) =>
  Object.entries(stock || {}).reduce(
    (s, [sid, m]) => (sid === OFFICE_ID ? s : s + (Number(m?.[productId]) || 0)),
    0,
  );

/** Quantity of a product held in one storage. `total` is the product's stockQuantity. */
export function qtyIn(storageId: string, productId: string, total: number, stock: StockMap | undefined): number {
  if (storageId === OFFICE_ID) return Math.max(0, (total || 0) - othersTotal(stock, productId));
  return Math.max(0, Number(stock?.[storageId]?.[productId]) || 0);
}

/** The storages that currently hold the product (quantity above 0), Office first. */
export function storageBreakdown(storages: StorageLite[], stock: StockMap | undefined, productId: string, total: number) {
  return storages
    .map(s => ({ storage: s, qty: qtyIn(s.id, productId, total, stock) }))
    .filter(x => x.qty > 0);
}
