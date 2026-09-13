import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Assign a role to a user',
  authenticated: true,
  inputSchema: z.object({
    userId: z.string(),
    roleId: z.string(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ input }) => {
    let settings = await zite.businessSettings.findOne({});
    if (!settings) {
      settings = await zite.businessSettings.create({
        record: { businessName: 'Uptown Vapes', customFields: JSON.stringify({ userRoles: {} }) },
      });
    }
    let customData: any = {};
    try {
      if (settings.customFields) customData = JSON.parse(settings.customFields);
    } catch {}
    if (!customData.userRoles) customData.userRoles = {};
    customData.userRoles[input.userId] = input.roleId;

    await zite.businessSettings.update({
      id: settings.id,
      record: { customFields: JSON.stringify(customData) },
    });
    return { success: true };
  },
});
