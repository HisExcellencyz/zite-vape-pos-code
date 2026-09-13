import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Get the current user permissions based on assigned role',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.object({ permissions: z.any(), roleName: z.string() }),
  execute: async ({ context }) => {
    const settings = await zite.businessSettings.findOne({});
    let userRoleMap: Record<string, string> = {};
    let pendingInvites: Record<string, any> = {};
    try {
      if (settings?.customFields) {
        const parsed = JSON.parse(settings.customFields);
        userRoleMap = parsed.userRoles || {};
        pendingInvites = parsed.pendingInvites || {};
      }
    } catch {}

    // Check if this user was a pending invite and auto-assign their role
    const emailKey = context.user.email.toLowerCase();
    if (pendingInvites[emailKey] && !userRoleMap[context.user.id]) {
      userRoleMap[context.user.id] = pendingInvites[emailKey].roleId;
      delete pendingInvites[emailKey];
      const customData = JSON.parse(settings?.customFields || '{}');
      customData.userRoles = userRoleMap;
      customData.pendingInvites = pendingInvites;
      if (settings) {
        await zite.businessSettings.update({
          id: settings.id,
          record: { customFields: JSON.stringify(customData) },
        });
      }
    }

    const roleId = userRoleMap[context.user.id];
    if (!roleId) {
      // No role assigned — give full permissions (owner/admin)
      return {
        permissions: {
          pos: { view: true, create: true, edit: true, delete: true, export: true, import: true, approve: true },
          customers: { view: true, create: true, edit: true, delete: true, export: true, import: true, approve: true },
          inventory: { view: true, create: true, edit: true, delete: true, export: true, import: true, approve: true },
          purchases: { view: true, create: true, edit: true, delete: true, export: true, import: true, approve: true },
          suppliers: { view: true, create: true, edit: true, delete: true, export: true, import: true, approve: true },
          expenses: { view: true, create: true, edit: true, delete: true, export: true, import: true, approve: true },
          reports: { view: true, create: true, edit: true, delete: true, export: true, import: true, approve: true },
          users: { view: true, create: true, edit: true, delete: true, export: true, import: true, approve: true },
          settings: { view: true, create: true, edit: true, delete: true, export: true, import: true, approve: true },
        },
        roleName: 'Owner',
      };
    }

    const role = await zite.roles.findOne({ id: roleId });
    if (!role || !role.permissions) {
      return { permissions: {}, roleName: 'Unknown' };
    }

    try {
      return { permissions: JSON.parse(role.permissions), roleName: role.roleName || 'Unknown' };
    } catch {
      return { permissions: {}, roleName: role.roleName || 'Unknown' };
    }
  },
});
