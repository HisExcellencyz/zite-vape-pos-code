import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { fullPermissions, normalizePerms, isAdminRoleName } from '../lib/permissionAreas';

/**
 * IMPORTANT: put the business owner's sign-in email here, e.g. ['owner@example.com'].
 * Owners always get full access. If this list is left empty, the FIRST person to
 * sign in (before any owner is recorded) becomes the Owner.
 */
const OWNER_EMAILS: string[] = [];

export default createEndpoint({
  description: 'Get the current user permissions based on assigned role. Owner and Admin get every permission (including backdating). Users with no role are "pending" until an admin assigns one.',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.object({
    permissions: z.any(),
    roleName: z.string(),
    pending: z.boolean().optional(),
    canBackdate: z.boolean().optional(),
  }),
  execute: async ({ context }) => {
    const settings = await zite.businessSettings.findOne({});
    let cfg: any = {};
    try { if (settings?.customFields) cfg = JSON.parse(settings.customFields); } catch {}
    if (!cfg.userRoles) cfg.userRoles = {};
    if (!cfg.pendingInvites) cfg.pendingInvites = {};
    if (!Array.isArray(cfg.ownerIds)) cfg.ownerIds = [];

    const userId = context.user.id;
    const emailKey = (context.user.email || '').toLowerCase();
    let dirty = false;

    // Accept a pending invitation: attach the invited role to this account.
    const invite = cfg.pendingInvites[emailKey];
    if (invite) {
      if (invite.roleId && !cfg.userRoles[userId]) cfg.userRoles[userId] = invite.roleId;
      delete cfg.pendingInvites[emailKey];
      dirty = true;
    }

    // Owner detection
    const ownerListed = OWNER_EMAILS.map(e => e.toLowerCase()).includes(emailKey);
    let isOwner = cfg.ownerIds.includes(userId) || ownerListed;
    if (!isOwner && !invite && OWNER_EMAILS.length === 0 && cfg.ownerIds.length === 0 && !cfg.userRoles[userId]) {
      isOwner = true; // very first sign-in becomes the owner
    }
    if (isOwner && !cfg.ownerIds.includes(userId)) {
      cfg.ownerIds.push(userId);
      dirty = true;
    }

    if (dirty) {
      const customFields = JSON.stringify(cfg);
      if (settings) {
        await zite.businessSettings.update({ id: settings.id, record: { customFields } });
      } else {
        await zite.businessSettings.create({ record: { businessName: 'Uptown Vapes', customFields } });
      }
    }

    if (isOwner) return { permissions: fullPermissions(), roleName: 'Owner', pending: false, canBackdate: true };

    const roleId = cfg.userRoles[userId];
    if (!roleId) return { permissions: {}, roleName: 'No role assigned', pending: true, canBackdate: false };

    const role = await zite.roles.findOne({ id: roleId });
    if (!role) return { permissions: {}, roleName: 'No role assigned', pending: true, canBackdate: false };

    // Any role with "admin" in its name has every permission, same as the Owner.
    if (isAdminRoleName(role.roleName)) {
      return { permissions: fullPermissions(), roleName: role.roleName || 'Admin', pending: false, canBackdate: true };
    }

    let raw: any = {};
    try { raw = role.permissions ? JSON.parse(role.permissions) : {}; } catch {}
    // normalizePerms lets roles saved before newer areas existed inherit the older area's permissions.
    return { permissions: normalizePerms(raw), roleName: role.roleName || 'Unknown', pending: false, canBackdate: false };
  },
});
