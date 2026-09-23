import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Assign a role to a user or pending invite. Use roleId "none" to remove access.',
  authenticated: true,
  inputSchema: z.object({
    userId: z.string(),
    roleId: z.string(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ input, context }) => {
    let settings = await zite.businessSettings.findOne({});
    if (!settings) {
      settings = await zite.businessSettings.create({
        record: { businessName: 'Uptown Vapes', customFields: JSON.stringify({ userRoles: {}, pendingInvites: {} }) },
      });
    }
    let cfg: any = {};
    try { if (settings.customFields) cfg = JSON.parse(settings.customFields); } catch {}
    if (!cfg.userRoles) cfg.userRoles = {};
    if (!cfg.pendingInvites) cfg.pendingInvites = {};
    const ownerIds: string[] = Array.isArray(cfg.ownerIds) ? cfg.ownerIds : [];

    // Only owners or users allowed to edit users can change roles
    let allowed = ownerIds.includes(context.user.id);
    if (!allowed) {
      const myRoleId = cfg.userRoles[context.user.id];
      if (myRoleId) {
        const role = await zite.roles.findOne({ id: myRoleId });
        let p: any = {};
        try { p = JSON.parse(role?.permissions || '{}'); } catch {}
        allowed = p?.users?.edit === true || (role?.roleName || '').toLowerCase().includes('admin');
      }
    }
    if (!allowed) throw new Error('You do not have permission to manage users');

    const clear = input.roleId === 'none' || input.roleId === '';

    if (input.userId.startsWith('pending_')) {
      const email = input.userId.slice('pending_'.length).toLowerCase();
      if (!cfg.pendingInvites[email]) throw new Error('Invitation not found');
      cfg.pendingInvites[email].roleId = clear ? null : input.roleId;
    } else {
      if (ownerIds.includes(input.userId)) throw new Error("The owner's access cannot be changed");
      if (clear && input.userId === context.user.id) throw new Error('You cannot remove your own access');
      if (clear) delete cfg.userRoles[input.userId];
      else cfg.userRoles[input.userId] = input.roleId;
    }

    await zite.businessSettings.update({
      id: settings.id,
      record: { customFields: JSON.stringify(cfg) },
    });
    return { success: true };
  },
});
