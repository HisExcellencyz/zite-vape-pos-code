import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'List app users with their roles, including pending invites',
  authenticated: true,
  inputSchema: z.object({
    search: z.string().optional(),
  }),
  outputSchema: z.object({ users: z.array(z.any()), roles: z.array(z.any()) }),
  execute: async ({ input, context }) => {
    const appId = '6hepsbbapu';
    const { records: users } = await zite.auth.findAllUsers({ appIds: [appId], limit: 200 });
    const { records: roles } = await zite.roles.findAll({ limit: 100 });

    const settings = await zite.businessSettings.findOne({});
    let cfg: any = {};
    try { if (settings?.customFields) cfg = JSON.parse(settings.customFields); } catch {}
    const userRoleMap: Record<string, string> = cfg.userRoles || {};
    const pendingInvites: Record<string, any> = cfg.pendingInvites || {};
    const ownerIds: string[] = Array.isArray(cfg.ownerIds) ? cfg.ownerIds : [];

    // Only owners, or roles allowed to view/manage users, may see this list.
    const myRoleId = userRoleMap[context.user.id];
    if (!ownerIds.includes(context.user.id)) {
      const myRole = myRoleId ? roles.find(r => r.id === myRoleId) : null;
      let p: any = {};
      try { p = JSON.parse(myRole?.permissions || '{}'); } catch {}
      const isAdminName = (myRole?.roleName || '').toLowerCase().includes('admin');
      if (!(p?.users?.view === true || p?.users?.edit === true || isAdminName)) {
        throw new Error('You do not have permission to view users');
      }
    }

    const existingEmails = new Set(users.map(u => u.email?.toLowerCase()));

    const enriched = users.map(u => {
      const isOwner = ownerIds.includes(u.id);
      const roleId = isOwner ? null : (userRoleMap[u.id] || null);
      return {
        ...u,
        isOwner,
        roleId,
        roleName: isOwner ? 'Owner' : (roles.find(r => r.id === roleId)?.roleName || 'Unassigned'),
        status: (u as any).emailVerified || isOwner || roleId ? 'Verified' : 'Unverified',
      };
    });

    // Invitations that have not signed in yet
    const pendingUsers = Object.entries(pendingInvites)
      .filter(([email]) => !existingEmails.has(email.toLowerCase()))
      .map(([email, data]: [string, any]) => ({
        id: `pending_${email}`,
        email,
        name: [data.firstName, data.lastName].filter(Boolean).join(' ') || email,
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        emailVerified: false,
        isOwner: false,
        roleId: data.roleId || null,
        roleName: roles.find(r => r.id === data.roleId)?.roleName || 'Unassigned',
        status: 'Invited',
        invitedBy: data.invitedBy,
        invitedAt: data.invitedAt,
      }));

    let allUsers = [...enriched, ...pendingUsers];

    if (input.search) {
      const s = input.search.toLowerCase();
      allUsers = allUsers.filter(u =>
        u.name?.toLowerCase().includes(s) ||
        u.email?.toLowerCase().includes(s)
      );
    }

    return { users: allUsers, roles };
  },
});
