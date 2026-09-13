import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Create or update a category',
  authenticated: true,
  inputSchema: z.object({
    id: z.string().optional(),
    categoryName: z.string().min(1),
    description: z.string().optional(),
    active: z.boolean().optional(),
  }),
  outputSchema: z.object({ category: z.any() }),
  execute: async ({ input }) => {
    if (input.id) {
      const updated = await zite.categories.update({
        id: input.id,
        record: {
          categoryName: input.categoryName,
          description: input.description || null,
          active: input.active ?? true,
        },
      });
      return { category: updated };
    }
    const category = await zite.categories.create({
      record: {
        categoryName: input.categoryName,
        description: input.description || null,
        active: input.active ?? true,
      },
    });
    return { category };
  },
});
