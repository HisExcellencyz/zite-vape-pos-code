import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { loadCategoryRows } from '../lib/categoryParents';

export default createEndpoint({
  description: 'List categories. Each row carries parentId (null for a top-level category, otherwise the id of the category it sits under).',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.object({ categories: z.array(z.any()) }),
  execute: async () => {
    return { categories: await loadCategoryRows() };
  },
});
