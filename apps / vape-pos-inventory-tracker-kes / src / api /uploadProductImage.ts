import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { normalizeImageUrl, isHttpUrl } from '../lib/imageUrl';

export default createEndpoint({
  description: 'Attach (or remove) the photo of a product using a link to an already-hosted image.',
  authenticated: true,
  inputSchema: z.object({
    productId: z.string(),
    imageUrl: z.string().optional(),
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

    const raw = (input.imageUrl || '').trim();
    if (!raw) throw new Error('An image link is required');

    const url = normalizeImageUrl(raw);
    if (!isHttpUrl(url)) {
      throw new Error('Image link must start with http:// or https://');
    }
    if (url.length > 2000) {
      throw new Error('That link is too long. Please use a shorter, direct image link.');
    }

    const safeName = (input.filename || `${product.sku || 'product'}.jpg`)
      .replace(/[^a-zA-Z0-9._-]/g, '_');

    const updated = await zite.products.update({
      id: input.productId,
      record: { images: [{ url, filename: safeName }] },
    });
    return { success: true, images: (updated as any)?.fields?.images ?? null };
  },
});
