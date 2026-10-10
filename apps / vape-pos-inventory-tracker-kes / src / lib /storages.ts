import { zite } from 'zitejs/db';
import { OFFICE_ID, StockMap, StorageLite, qtyIn } from './storageMath';
import { normalizeAddrType } from './addressTypes';

/**
 * Storages (server side only).
 *
 * Kept in the app settings record, like riders and category parents:
 *   customFields.storages               = [{ id, name, type: 'office' | 'custom' | 'rider', riderId? }]
 *   customFields.storageStock           = { [storageId]: { [productId]: qty } }   (Office is derived, see storageMath.ts)
 *   customFields.addressStorages        = { [addressId]: storageId }              (Storage-type locations)
 *   customFields.storagePrimaryAddress  = { [storageId]: addressId }              (the automatic location of a storage)
 *
 * - The Office storage always exists.
 * - Every Own Rider automatically has a storage of their own (never replicated under Addresses).
 * - Office and custom storages are automatically replicated as Storage-type locations under Addresses.
 *   The location's name is independent: renaming it in Addresses never renames the storage, and vice versa.
 */

export type Storage = StorageLite;

async function loadCfg() {
  const settings = await zite.businessSettings.findOne({});
  let cfg: any = {};
  try { if (settings?.customFields) cfg = JSON.parse(settings.customFields); } catch {}
  return { settings, cfg };
}

async function saveCfg(settings: any, cfg: any) {
  const customFields = JSON.stringify(cfg);
  if (settings) await zite.businessSettings.update({ id: settings.id, record: { customFields } });
  else await zite.businessSettings.create({ record: { businessName: 'Uptown Vapes', customFields } });
}

/**
 * Makes sure the Office exists, every Own Rider has a storage (renamed with the rider, removed with the rider),
 * and every Office / custom storage has a Storage-type location under Addresses. Returns the current state.
 */
export async function ensureStorages() {
  const { settings, cfg } = await loadCfg();
  let dirty = false;

  let storages: Storage[] = Array.isArray(cfg.storages) ? cfg.storages : [];
  const stock: StockMap = cfg.storageStock && typeof cfg.storageStock === 'object' ? cfg.storageStock : {};

  if (!storages.some(s => s.id === OFFICE_ID)) {
    storages.unshift({ id: OFFICE_ID, name: 'Office', type: 'office' });
    dirty = true;
  }

  // One storage per Own Rider.
  const riders: any[] = Array.isArray(cfg.riders?.own) ? cfg.riders.own : [];
  for (const r of riders) {
    const name = String(r.name || 'Rider');
    const ex = storages.find(s => s.riderId === r.id);
    if (!ex) { storages.push({ id: `sr_${r.id}`, name, type: 'rider', riderId: r.id }); dirty = true; }
    else if (ex.name !== name) { ex.name = name; dirty = true; }
  }
  const liveRiders = new Set(riders.map(r => r.id));
  const kept = storages.filter(s => s.type !== 'rider' || liveRiders.has(s.riderId as string));
  if (kept.length !== storages.length) {
    // A removed rider's stock simply falls back to the Office (the Office is the remainder).
    storages.filter(s => !kept.includes(s)).forEach(s => { delete stock[s.id]; });
    storages = kept;
    dirty = true;
  }

  // Storage-type locations for Office and custom storages (never for riders).
  const links: Record<string, string> = cfg.addressStorages || {};
  const primary: Record<string, string> = cfg.storagePrimaryAddress || {};
  const need = storages.filter(s => s.type !== 'rider' && !primary[s.id]);
  if (need.length > 0) {
    const { records: addrs } = await zite.addresses.findAll({ limit: 2000 });
    for (const s of need) {
      // An existing "Profleet Capital" location (not a supplier's) becomes the Office location instead of being duplicated.
      let addr: any = s.type === 'office'
        ? addrs.find(a => /profleet\s*capital/i.test(a.addressName || '') && normalizeAddrType(a.type) !== 'supplier' && !Object.prototype.hasOwnProperty.call(links, a.id))
        : undefined;
      if (addr) await zite.addresses.update({ id: addr.id, record: { type: 'storage' } });
      else addr = await zite.addresses.create({ record: { addressName: s.name, type: 'storage', active: true } });
      links[addr.id] = s.id;
      primary[s.id] = addr.id;
    }
    dirty = true;
  }

  if (dirty) {
    cfg.storages = storages;
    cfg.storageStock = stock;
    cfg.addressStorages = links;
    cfg.storagePrimaryAddress = primary;
    await saveCfg(settings, cfg);
  }
  return { settings, cfg, storages, stock };
}

export async function createStorage(name: string) {
  const clean = name.trim();
  if (!clean) throw new Error('Storage name is required');
  const { settings, cfg, storages } = await ensureStorages();
  if (storages.some(s => s.name.trim().toLowerCase() === clean.toLowerCase())) throw new Error('A storage with this name already exists');
  storages.push({ id: `st_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: clean, type: 'custom' });
  cfg.storages = storages;
  await saveCfg(settings, cfg);
  await ensureStorages(); // creates its Storage-type location under Addresses
}

/** Renames the storage only. Its location under Addresses keeps its own name. Rider storages are renamed via the rider. */
export async function renameStorage(id: string, name: string) {
  const clean = name.trim();
  if (!clean) throw new Error('Storage name is required');
  const { settings, cfg, storages } = await ensureStorages();
  const st = storages.find(s => s.id === id);
  if (!st) throw new Error('Storage not found');
  if (st.type === 'rider') throw new Error('Rider storages are named after the rider. Rename the rider in Settings > Delivery.');
  if (storages.some(s => s.id !== id && s.name.trim().toLowerCase() === clean.toLowerCase())) throw new Error('A storage with this name already exists');
  st.name = clean;
  cfg.storages = storages;
  await saveCfg(settings, cfg);
}

/** Deletes a custom storage. Its stock falls back to the Office. Its automatic location is removed too. */
export async function deleteStorage(id: string) {
  const { settings, cfg, storages, stock } = await ensureStorages();
  const st = storages.find(s => s.id === id);
  if (!st) throw new Error('Storage not found');
  if (st.type !== 'custom') throw new Error(st.type === 'office' ? 'The Office cannot be deleted' : 'Rider storages are removed with the rider');
  const links: Record<string, string> = cfg.addressStorages || {};
  const primary: Record<string, string> = cfg.storagePrimaryAddress || {};
  const addrId = primary[id];
  if (addrId) { try { await zite.addresses.delete({ id: addrId }); } catch {} delete links[addrId]; }
  delete primary[id];
  for (const [aid, sid] of Object.entries(links)) if (sid === id) delete links[aid];
  delete stock[id];
  cfg.storages = storages.filter(s => s.id !== id);
  cfg.storageStock = stock;
  cfg.addressStorages = links;
  cfg.storagePrimaryAddress = primary;
  await saveCfg(settings, cfg);
}

/** Moves stock between storages. Total stock does not change. All lines are checked before anything is applied. */
export async function transferStock(fromId: string, toId: string, items: { productId: string; quantity: number }[]) {
  if (fromId === toId) throw new Error('Choose two different storages');
  const { settings, cfg, storages, stock } = await ensureStorages();
  const from = storages.find(s => s.id === fromId);
  const to = storages.find(s => s.id === toId);
  if (!from || !to) throw new Error('Storage not found');

  const plan: { productId: string; qty: number; avail: number }[] = [];
  for (const it of items) {
    const qty = Math.floor(Number(it.quantity) || 0);
    if (qty <= 0) continue;
    const product = await zite.products.findOne({ id: it.productId });
    if (!product) throw new Error('Product not found');
    const avail = qtyIn(fromId, it.productId, product.stockQuantity || 0, stock);
    if (qty > avail) throw new Error(`Only ${avail} of ${product.productName} available in ${from.name}`);
    plan.push({ productId: it.productId, qty, avail });
  }
  if (plan.length === 0) throw new Error('Enter a quantity to transfer');

  for (const p of plan) {
    if (fromId !== OFFICE_ID) {
      stock[fromId] = stock[fromId] || {};
      const left = p.avail - p.qty;
      if (left > 0) stock[fromId][p.productId] = left; else delete stock[fromId][p.productId];
    }
    if (toId !== OFFICE_ID) {
      stock[toId] = stock[toId] || {};
      stock[toId][p.productId] = (Number(stock[toId][p.productId]) || 0) + p.qty;
    }
  }
  cfg.storageStock = stock;
  await saveCfg(settings, cfg);
  return plan.length;
}

/**
 * Deducts sold items from stock (called by createSale).
 *  - Items picked up from a supplier (supplierPicked) never entered stock, so nothing is deducted from any storage.
 *  - Items ticked at a Storage pick-up are taken from that storage (what it lacks falls back to the Office).
 *  - Other items are taken from the assigned Own Rider's storage when he has them (what he lacks falls back to the Office).
 *  - Everything else is taken from the Office, the default.
 */
export async function deductStock(
  items: { productId: string; quantity: number }[],
  opts: { supplierPicked?: string[]; storagePicks?: Record<string, string[]>; riderId?: string },
) {
  const { settings, cfg, storages, stock } = await ensureStorages();
  const supplier = new Set(opts.supplierPicked || []);
  const picks = opts.storagePicks || {};
  const riderStorage = opts.riderId ? storages.find(s => s.riderId === opts.riderId) : undefined;
  let changed = false;

  for (const item of items) {
    if (supplier.has(item.productId)) continue;
    const product = await zite.products.findOne({ id: item.productId });
    if (!product) continue;
    const total = product.stockQuantity || 0;
    let remaining = item.quantity;
    let officeLeft = qtyIn(OFFICE_ID, item.productId, total, stock);

    const take = (sid: string) => {
      const avail = sid === OFFICE_ID ? officeLeft : Math.max(0, Number(stock[sid]?.[item.productId]) || 0);
      const n = Math.min(remaining, avail);
      if (n <= 0) return;
      if (sid === OFFICE_ID) officeLeft -= n;
      else { stock[sid] = stock[sid] || {}; stock[sid][item.productId] = avail - n; changed = true; }
      remaining -= n;
    };

    const pickedAt = Object.entries(picks).find(([sid, ids]) => ids.includes(item.productId) && storages.some(s => s.id === sid));
    if (pickedAt) take(pickedAt[0]);
    else if (riderStorage) take(riderStorage.id);
    // Whatever is left comes out of the Office, which is simply the remainder of the total.

    await zite.products.update({ id: item.productId, record: { stockQuantity: Math.max(0, total - item.quantity) } });
  }

  if (changed) {
    cfg.storageStock = stock;
    await saveCfg(settings, cfg);
  }
}
