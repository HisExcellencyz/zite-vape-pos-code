import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Attach (or remove) the photo of a product. The image is a small square JPEG data URL prepared in the browser.',
  authenticated: true,
  inputSchema: z.object({
    productId: z.string(),
    dataUrl: z.string().optional(),
    filename: z.string().optional(),
    remove: z.boolean().optional(),
  }),
  outputSchema: z.object({ success: z.boolean(), images: z.any() }),
  execute: async ({ input }) => {
    const product = await zite.products.findOne({ id: input.productId });
    if (!product) throw new Error('Product not found');

    if (input.remove) {
      await zite.products.update({ id: input.productId, record: { images: null } });
      return { success: true, images: [] };
    }

    if (!input.dataUrl || !input.dataUrl.startsWith('data:image/')) {
      throw new Error('A valid image is required');
    }
    if (input.dataUrl.length > 600_000) {
      throw new Error('Image is too large. Please choose a smaller photo.');
    }

    const safeName = (input.filename || `${product.sku || 'product'}.jpg`)
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.[a-zA-Z0-9]+$/, '') + '.jpg';

    const updated = await zite.products.update({
      id: input.productId,
      record: { images: [{ url: input.dataUrl, filename: safeName }] },
    });
    return { success: true, images: (updated as any)?.fields?.images ?? null };
  },
});
