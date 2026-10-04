import { zite } from 'zitejs/db';
import { fullPermissions, normalizePerms, isAdminRoleName } from './permissionAreas';

/**
 * Server-side access check. Owner and any role whose name contains "admin" get every permission,
 * including backdating. Everyone else is limited to what their role's matrix allows.
 */
export async function getAccess(userId: string) {
  const settings = await zite.businessSettings.findOne({});
  let cfg: any = {};
  try { if (settings?.customFields) cfg = JSON.parse(settings.customFields); } catch {}
  const isOwner = (cfg.ownerIds || []).includes(userId);
  let isAdmin = false;
  let raw: any = {};
  if (!isOwner) {
    const roleId = cfg.userRoles?.[userId];
    if (roleId) {
      const role = await zite.roles.findOne({ id: roleId });
      isAdmin = isAdminRoleName(role?.roleName);
      try { raw = role?.permissions ? JSON.parse(role.permissions) : {}; } catch {}
    }
  }
  const full = isOwner || isAdmin;
  const matrix = full ? fullPermissions() : normalizePerms(raw);
  return {
    isOwner,
    isAdmin,
    /** Only the Owner and Admin may change dates or create backdated entries. */
    canBackdate: full,
    can: (area: string, action: string) => full || matrix[area]?.[action] === true,
  };
}

/** Throws unless the user may do `action` in at least one of the given permission areas. */
export async function assertCan(userId: string, areas: string | string[], action: string) {
  const access = await getAccess(userId);
  const list = Array.isArray(areas) ? areas : [areas];
  if (!list.some(a => access.can(a, action))) {
    throw new Error(`You do not have permission to ${action} here. Ask an administrator to update your role.`);
  }
  return access;
}
