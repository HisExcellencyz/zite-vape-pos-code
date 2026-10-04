import { zite } from 'zitejs/db';
import { fullPermissions, withInheritance, lockAdminOnly, isAdminRoleName, PermMatrix } from './permissions';

export interface Access {
  isOwner: boolean;
  isAdmin: boolean; // Owner or an Admin role
  roleName: string;
  permissions: PermMatrix;
  canBackdate: boolean; // Owner & Admin only
}

/** Works out what a signed-in user may do. Owner and Admin always get every permission. */
export async function getAccess(userId: string): Promise<Access> {
  const settings = await zite.businessSettings.findOne({});
  let cfg: any = {};
  try { if (settings?.customFields) cfg = JSON.parse(settings.customFields); } catch {}

  if ((cfg.ownerIds || []).includes(userId)) {
    return { isOwner: true, isAdmin: true, roleName: 'Owner', permissions: fullPermissions(), canBackdate: true };
  }
  const roleId = cfg.userRoles?.[userId];
  const role = roleId ? await zite.roles.findOne({ id: roleId }) : undefined;
  if (role && isAdminRoleName(role.roleName)) {
    return { isOwner: false, isAdmin: true, roleName: role.roleName || 'Admin', permissions: fullPermissions(), canBackdate: true };
  }
  let raw: any = {};
  try { raw = role?.permissions ? JSON.parse(role.permissions) : {}; } catch {}
  return {
    isOwner: false,
    isAdmin: false,
    roleName: role?.roleName || '',
    permissions: lockAdminOnly(withInheritance(raw)),
    canBackdate: false,
  };
}

/** Throws unless the user holds the given permission. Returns their access for further checks. */
export async function requirePermission(userId: string, area: string, action: string): Promise<Access> {
  const access = await getAccess(userId);
  if (!access.permissions[area]?.[action]) {
    throw new Error(`You do not have permission to ${action} in ${area}. Ask an administrator to update your role.`);
  }
  return access;
}
