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
  execute: async ({ input }) => {
    if (input.id) {
      const updated = await zite.roles.update({
        id: input.id,
        record: {
          roleName: input.roleName,
          description: input.description || null,
          permissions: input.permissions,
          isDefault: input.isDefault ?? false,
          active: input.active ?? true,
        },
      });
      return { role: updated };
    }
    const role = await zite.roles.create({
      record: {
        roleName: input.roleName,
        description: input.description || null,
        permissions: input.permissions,
        isDefault: input.isDefault ?? false,
        active: input.active ?? true,
      },
    });
    return { role };
  },
});
