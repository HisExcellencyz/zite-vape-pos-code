import { zite } from 'zitejs/db';

/**
 * Returns a predicate that keeps only records belonging to the given outlet.
 * Records with no outlet assigned (legacy data) are treated as belonging to the main outlet.
 * With no branchId, everything is kept (business-wide view).
 */
export async function branchFilter(branchId?: string) {
  if (!branchId) return (_r: { branch?: string | string[] | null }) => true;
  const branch = await zite.branches.findOne({ id: branchId });
  const isMain = String(branch?.isMainBranch) === 'true';
  return (r: { branch?: string | string[] | null }) => {
    const ids = Array.isArray(r.branch) ? r.branch : r.branch ? [r.branch] : [];
    return ids.length === 0 ? isMain : ids.includes(branchId);
  };
}
