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
  execute: async ({ input }) => {
    const appId = '6hepsbbapu';
    const { records: users } = await zite.auth.findAllUsers({ appIds: [appId], limit: 200 });
    const { records: roles } = await zite.roles.findAll({ limit: 100 });

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

    // Build a set of emails that are already real users
    const existingEmails = new Set(users.map(u => u.email?.toLowerCase()));

    // Determine admin role IDs
    const adminRoleIds = new Set(
      roles.filter(r => (r.roleName || '').toLowerCase().includes('admin')).map(r => r.id)
    );

    let enrichedUsers = users.map(u => {
      const roleId = userRoleMap[u.id] || null;
      const isAdmin = roleId ? adminRoleIds.has(roleId) : false;
      return {
        ...u,
        roleId,
        roleName: roles.find(r => r.id === roleId)?.roleName || 'Unassigned',
        status: isAdmin || (u as any).emailVerified ? 'Verified' : 'Unverified',
      };
    });

    // Add pending invites that haven't signed up yet
    const pendingUsers = Object.entries(pendingInvites)
      .filter(([email]) => !existingEmails.has(email.toLowerCase()))
      .map(([email, data]: [string, any]) => ({
        id: `pending_${email}`,
        email,
        name: [data.firstName, data.lastName].filter(Boolean).join(' ') || email,
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        emailVerified: false,
        roleId: data.roleId || null,
        roleName: roles.find(r => r.id === data.roleId)?.roleName || 'Unassigned',
        status: 'Invited',
        invitedBy: data.invitedBy,
        invitedAt: data.invitedAt,
      }));

    let allUsers = [...enrichedUsers, ...pendingUsers];

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
