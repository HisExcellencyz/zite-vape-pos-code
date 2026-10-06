import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { readCategoryParents, writeCategoryParent } from '../lib/categoryParents';

export default createEndpoint({
  description: 'Create or update a category. parentId makes it a sub-category of that category (two levels only); null or empty makes it top-level.',
  authenticated: true,
  inputSchema: z.object({
    id: z.string().optional(),
    categoryName: z.string().min(1),
    description: z.string().optional(),
    active: z.boolean().optional(),
    /** Omit to leave the parent unchanged on an update; null/'' = top-level. */
    parentId: z.string().nullable().optional(),
  }),
  outputSchema: z.object({ category: z.any() }),
  execute: async ({ input }) => {
    const parents = await readCategoryParents();

    // Validate the requested parent: it must exist, be top-level itself, and not be this category.
    let newParent: string | null | undefined = undefined;
    if (input.parentId !== undefined) {
      newParent = input.parentId || null;
      if (newParent) {
        if (newParent === input.id) throw new Error('A category cannot be its own parent');
        const parent = await zite.categories.findOne({ id: newParent });
        if (!parent) throw new Error('The chosen parent category no longer exists');
        if (parents[newParent]) throw new Error('Only two levels are allowed: a sub-category cannot have sub-categories');
        if (input.id && Object.values(parents).includes(input.id)) {
          throw new Error('This category already has sub-categories, so it cannot become a sub-category itself');
        }
      }
    }

    let category: any;
    if (input.id) {
      category = await zite.categories.update({
        id: input.id,
        record: {
          categoryName: input.categoryName,
          description: input.description || null,
          active: input.active ?? true,
        },
      });
    } else {
      category = await zite.categories.create({
        record: {
          categoryName: input.categoryName,
          description: input.description || null,
          active: input.active ?? true,
        },
      });
    }

    if (newParent !== undefined) await writeCategoryParent(category.id, newParent);
    const parentId = newParent !== undefined ? newParent : parents[category.id] || null;
    return { category: { ...category, parentId } };
  },
});
