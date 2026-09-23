import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Create or update a role with permissions',
  authenticated: true,
  inputSchema: z.object({
    id: z.string().optional(),
    roleName: z.string().min(1),
    description: z.string().optional(),
    permissions: z.string(), // JSON string of permission matrix
    isDefault: z.boolean().optional(),
    active: z.boolean().optional(),
  }),
  outputSchema: z.object({ role: z.any() }),
  execute: async ({ input, context }) => {
    // Only owners or users allowed to edit users can change roles
    const settings = await zite.businessSettings.findOne({});
    let cfg: any = {};
    try { if (settings?.customFields) cfg = JSON.parse(settings.customFields); } catch {}
    let allowed = (cfg.ownerIds || []).includes(context.user.id);
    if (!allowed) {
      const myRoleId = cfg.userRoles?.[context.user.id];
      if (myRoleId) {
        const role = await zite.roles.findOne({ id: myRoleId });
        let p: any = {};
        try { p = JSON.parse(role?.permissions || '{}'); } catch {}
        allowed = p?.users?.edit === true || (role?.roleName || '').toLowerCase().includes('admin');
      }
    }
    if (!allowed) throw new Error('You do not have permission to manage roles');

    const record = {
      roleName: input.roleName,
      description: input.description || null,
      permissions: input.permissions,
      isDefault: input.isDefault ?? false,
      active: input.active ?? true,
    };

    if (input.id) {
      const updated = await zite.roles.update({ id: input.id, record });
      return { role: updated };
    }
    const role = await zite.roles.create({ record });
    return { role };
  },
});
