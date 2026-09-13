import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { Email } from 'zitejs/email';

export default createEndpoint({
  description: 'Invite a user by email and assign a role',
  authenticated: true,
  inputSchema: z.object({
    email: z.string().email(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    roleId: z.string().optional(),
  }),
  outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  execute: async ({ input, context }) => {
    const appUrl = process.env.ZITE_APP_URL;

    // Ensure settings record exists
    let settings = await zite.businessSettings.findOne({});
    if (!settings) {
      settings = await zite.businessSettings.create({
        record: { businessName: 'Uptown Vapes', customFields: JSON.stringify({ userRoles: {}, pendingInvites: {} }) },
      });
    }

    let customData: any = {};
    try {
      if (settings.customFields) customData = JSON.parse(settings.customFields);
    } catch {}
    if (!customData.userRoles) customData.userRoles = {};
    if (!customData.pendingInvites) customData.pendingInvites = {};

    customData.pendingInvites[input.email.toLowerCase()] = {
      roleId: input.roleId || null,
      firstName: input.firstName || '',
      lastName: input.lastName || '',
      invitedBy: context.user.email,
      invitedAt: new Date().toISOString(),
    };

    await zite.businessSettings.update({
      id: settings.id,
      record: { customFields: JSON.stringify(customData) },
    });

    // Try sending invite email — if email integration fails, still save the invite
    try {
      await Email.send({
        to: input.email,
        subject: "You've been invited to Uptown Vapes POS",
        body: [{
          type: 'text' as const,
          content: `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #111827; color: #e5e7eb; border-radius: 12px;">
              <h2 style="color: #60a5fa; margin-top: 0;">Welcome to Uptown Vapes</h2>
              <p>Hi${input.firstName ? ' ' + input.firstName : ''},</p>
              <p>${context.user.email} has invited you to join the Uptown Vapes POS & Inventory system.</p>
              <p>Click the button below to get started:</p>
              <a href="${appUrl}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0;">Accept Invite & Sign In</a>
              <p style="color: #9ca3af; font-size: 13px; margin-top: 24px;">If you didn't expect this invite, you can safely ignore this email.</p>
            </div>
          `,
        }],
      });
      return { success: true, message: `Invite sent to ${input.email}` };
    } catch (emailErr: any) {
      // Email failed but invite is saved — user can share the app link manually
      return { success: true, message: `Invite saved for ${input.email} (email delivery failed — please share the app link manually)` };
    }
  },
});
