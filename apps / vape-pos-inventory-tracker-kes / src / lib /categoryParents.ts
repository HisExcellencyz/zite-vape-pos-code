import { zite } from 'zitejs/db';

/**
 * Two-level category tree (server side only).
 *
 * The Categories table has no "parent" column, so — like riders and other shared settings — the link from each
 * sub-category to its parent is kept in the app settings record: customFields.categoryParents = { [subCategoryId]: parentCategoryId }.
 * A category with no entry is a top-level category. Only two levels are allowed: a sub-category cannot have sub-categories.
 */
export type ParentMap = Record<string, string>;

async function settingsRecord() {
  const { records } = await zite.businessSettings.findAll({ limit: 1 });
  return records[0] || null;
}

export async function readCategoryParents(): Promise<ParentMap> {
  const s = await settingsRecord();
  try {
    const cfg = s?.customFields ? JSON.parse(s.customFields) : {};
    return cfg?.categoryParents && typeof cfg.categoryParents === 'object' ? { ...cfg.categoryParents } : {};
  } catch {
    return {};
  }
}

/** Sets (or, with null, clears) the parent of one category. Re-reads the settings first so other saved keys are kept. */
export async function writeCategoryParent(categoryId: string, parentId: string | null) {
  const s = await settingsRecord();
  let cfg: any = {};
  try { cfg = s?.customFields ? JSON.parse(s.customFields) : {}; } catch {}
  const parents: ParentMap = cfg.categoryParents && typeof cfg.categoryParents === 'object' ? cfg.categoryParents : {};
  if (parentId) parents[categoryId] = parentId;
  else delete parents[categoryId];
  cfg.categoryParents = parents;
  const customFields = JSON.stringify(cfg);
  if (s) await zite.businessSettings.update({ id: s.id, record: { customFields } });
  else await zite.businessSettings.create({ record: { businessName: 'Uptown Vapes', customFields, defaultCurrency: 'KES' } });
}

/** All categories (id, name, parentId). A parent that no longer exists is treated as "no parent". */
export async function loadCategoryRows() {
  const { records } = await zite.categories.findAll({ limit: 2000 });
  const parents = await readCategoryParents();
  const ids = new Set(records.map((r: any) => r.id));
  return records.map((r: any) => ({
    ...r,
    parentId: parents[r.id] && ids.has(parents[r.id]) && parents[r.id] !== r.id ? parents[r.id] : null,
  }));
}

export const sameName = (a?: string | null, b?: string | null) =>
  (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
