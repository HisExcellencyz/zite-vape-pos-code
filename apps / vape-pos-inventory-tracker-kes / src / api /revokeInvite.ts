import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Cancel a pending user invitation',
  authenticated: true,
  inputSchema: z.object({ email: z.string() }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ input, context }) => {
    const settings = await zite.businessSettings.findOne({});
    if (!settings) return { success: true };
    let cfg: any = {};
    try { if (settings.customFields) cfg = JSON.parse(settings.customFields); } catch {}

    let allowed = (cfg.ownerIds || []).includes(context.user.id);
    if (!allowed) {
      const roleId = cfg.userRoles?.[context.user.id];
      if (roleId) {
        const role = await zite.roles.findOne({ id: roleId });
        let p: any = {};
        try { p = JSON.parse(role?.permissions || '{}'); } catch {}
        allowed = p?.users?.edit === true || (role?.roleName || '').toLowerCase().includes('admin');
      }
    }
    if (!allowed) throw new Error('You do not have permission to manage users');

    if (cfg.pendingInvites) delete cfg.pendingInvites[input.email.toLowerCase()];
    await zite.businessSettings.update({
      id: settings.id,
      record: { customFields: JSON.stringify(cfg) },
    });
    return { success: true };
  },
});
