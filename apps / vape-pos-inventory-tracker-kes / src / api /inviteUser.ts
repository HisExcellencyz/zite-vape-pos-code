import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { Email } from 'zitejs/email';

async function assertCanManageUsers(userId: string) {
  const settings = await zite.businessSettings.findOne({});
  let cfg: any = {};
  try { if (settings?.customFields) cfg = JSON.parse(settings.customFields); } catch {}
  if ((cfg.ownerIds || []).includes(userId)) return;
  const roleId = cfg.userRoles?.[userId];
  if (roleId) {
    const role = await zite.roles.findOne({ id: roleId });
    let p: any = {};
    try { p = JSON.parse(role?.permissions || '{}'); } catch {}
    if (p?.users?.edit === true || (role?.roleName || '').toLowerCase().includes('admin')) return;
  }
  throw new Error('You do not have permission to manage users');
}

export default createEndpoint({
  description: 'Invite a user by email and assign a role. Also used to resend an invitation.',
  authenticated: true,
  inputSchema: z.object({
    email: z.string().email(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    roleId: z.string().optional(),
  }),
  outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  execute: async ({ input, context }) => {
    await assertCanManageUsers(context.user.id);

    const appUrl = process.env.ZITE_APP_URL;
    const email = input.email.trim().toLowerCase();

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

    // Use the default role when none is chosen
    let roleId = input.roleId || null;
    if (!roleId) {
      const { records: roles } = await zite.roles.findAll({ limit: 100 });
      roleId = roles.find(r => r.isDefault)?.id || null;
    }

    // Person already has an account -> just assign the role
    const { records: users } = await zite.auth.findAllUsers({ appIds: ['6hepsbbapu'], limit: 200 });
    const existing = users.find(u => (u.email || '').toLowerCase() === email);
    if (existing) {
      if (!roleId) return { success: true, message: `${email} already has an account. Choose a role for them in the list.` };
      cfg.userRoles[existing.id] = roleId;
      await zite.businessSettings.update({ id: settings.id, record: { customFields: JSON.stringify(cfg) } });
      return { success: true, message: `${email} already has an account. Role assigned.` };
    }

    cfg.pendingInvites[email] = {
      roleId,
      firstName: input.firstName || '',
      lastName: input.lastName || '',
      invitedBy: context.user.email,
      invitedAt: new Date().toISOString(),
    };
    await zite.businessSettings.update({ id: settings.id, record: { customFields: JSON.stringify(cfg) } });

    try {
      await Email.send({
        to: email,
        subject: "You've been invited to Uptown Vapes POS",
        body: [{
          type: 'text' as const,
          content: `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #111827; color: #e5e7eb; border-radius: 12px;">
              <h2 style="color: #60a5fa; margin-top: 0;">Welcome to Uptown Vapes</h2>
              <p>Hi${input.firstName ? ' ' + input.firstName : ''},</p>
              <p>${context.user.email} has invited you to join the Uptown Vapes POS &amp; Inventory system.</p>
              <p>Open the link below, press <b>Sign In</b>, and sign in with <b>${email}</b> (email magic link or Google). Your access is set up automatically.</p>
              <a href="${appUrl}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0;">Accept Invite &amp; Sign In</a>
              <p style="color: #9ca3af; font-size: 13px; margin-top: 24px;">If you didn't expect this invite, you can safely ignore this email.</p>
            </div>
          `,
        }],
      });
      return { success: true, message: `Invite sent to ${email}` };
    } catch {
      return { success: true, message: `Invite saved for ${email} (email delivery failed — please share the app link manually)` };
    }
  },
});
