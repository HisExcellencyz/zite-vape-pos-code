import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { normalizeImageUrl, isHttpUrl } from '../lib/imageUrl';
import { assertCan } from '../lib/permissions';
import { syncSupplierAddress } from '../lib/supplierAddress';
import { loadCategoryRows, writeCategoryParent, sameName } from '../lib/categoryParents';

export default createEndpoint({
  description: 'Import CSV data for products, customers, or suppliers',
  authenticated: true,
  inputSchema: z.object({
    table: z.enum(['products', 'customers', 'suppliers']),
    rows: z.array(z.record(z.string())),
  }),
  outputSchema: z.object({ imported: z.number(), updated: z.number(), errors: z.array(z.string()) }),
  execute: async ({ input, context }) => {
    await assertCan(context.user.id, input.table, 'import');
    let imported = 0;
    let updated = 0;
    const errors: string[] = [];

    switch (input.table) {
      case 'products': {
        // Two-level categories: "Category" is the top-level one, "Subcategory" (optional) the one under it.
        // Both are matched by name (ignoring capitals) and created when they do not exist yet.
        type CatRow = { id: string; categoryName?: string; parentId: string | null };
        const cats: CatRow[] = (await loadCategoryRows()) as CatRow[];
        const findCat = (name: string, parentId: string | null) =>
          cats.find(c => sameName(c.categoryName, name) && (c.parentId || null) === parentId);
        const ensureCat = async (name: string, parentId: string | null): Promise<string> => {
          const hit = findCat(name, parentId);
          if (hit) return hit.id;
          const created = await zite.categories.create({ record: { categoryName: name, active: true } });
          if (parentId) await writeCategoryParent(created.id, parentId);
          cats.push({ id: created.id, categoryName: name, parentId });
          return created.id;
        };

        for (const row of input.rows) {
          try {
            const name = row['Product Name'] || row['productName'] || row['name'] || '';
            const sku = row['SKU'] || row['sku'] || '';
            if (!name || !sku) { errors.push(`Row missing name or SKU: ${JSON.stringify(row)}`); continue; }

            const costPrice = Number(row['Cost Price'] || row['costPrice'] || 0);
            const sellingPrice = Number(row['Selling Price'] || row['sellingPrice'] || 0);
            const stockQuantity = Number(row['Stock Quantity'] || row['stockQuantity'] || row['stock'] || 0);
            const status = (costPrice === 0 || sellingPrice === 0) ? 'Inactive' : 'Active';

            let categoryId: string | undefined;
            const categoryName = (row['Category'] || row['category'] || '').trim();
            const subName = (row['Subcategory'] || row['subcategory'] || row['Sub Category'] || row['Sub-category'] || '').trim();
            if (categoryName) {
              const topId = await ensureCat(categoryName, null);
              categoryId = subName ? await ensureCat(subName, topId) : topId;
            } else if (subName) {
              // Subcategory without a Category: only usable when exactly one existing sub-category has that name.
              const hits = cats.filter(c => c.parentId && sameName(c.categoryName, subName));
              if (hits.length === 1) categoryId = hits[0].id;
              else errors.push(`SKU ${sku}: Subcategory "${subName}" needs a Category in the same row, category left unchanged`);
            }

            // Optional photo link. Blank column = leave the existing photo untouched
            // on updates; invalid link = skip just the photo, not the whole row.
            const imageUrlRaw = (row['Image URL'] || row['ImageURL'] || row['Image Url'] || row['imageUrl'] || row['Image Link'] || '').trim();
            let imageRecord: { url: string }[] | undefined;
            if (imageUrlRaw) {
              const normalized = normalizeImageUrl(imageUrlRaw);
              if (isHttpUrl(normalized)) {
                imageRecord = [{ url: normalized }];
              } else {
                errors.push(`SKU ${sku}: Image URL must start with http:// or https://, photo skipped`);
              }
            }

            // Check if SKU exists
            const existing = await zite.products.findOne({ filters: { sku } });
            if (existing) {
              await zite.products.update({
                id: existing.id,
                record: {
                  productName: name,
                  costPrice,
                  sellingPrice,
                  stockQuantity,
                  status,
                  ...(categoryId ? { category: categoryId } : {}),
                  ...(imageRecord ? { images: imageRecord } : {}),
                },
              });
              updated++;
            } else {
              await zite.products.create({
                record: {
                  productName: name,
                  sku,
                  costPrice,
                  sellingPrice,
                  stockQuantity,
                  status,
                  reorderLevel: 5,
                  taxRate: 0,
                  ...(categoryId ? { category: categoryId } : {}),
                  ...(imageRecord ? { images: imageRecord } : {}),
                },
              });
              imported++;
            }
          } catch (e: any) {
            errors.push(e.message || 'Unknown error');
          }
        }
        break;
      }
      case 'customers': {
        for (const row of input.rows) {
          try {
            const name = row['Customer Name'] || row['customerName'] || row['name'] || '';
            let phone = row['Phone Number'] || row['phoneNumber'] || row['phone'] || '';
            if (!name || !phone) { errors.push(`Row missing name or phone: ${JSON.stringify(row)}`); continue; }
            if (!phone.startsWith('+')) phone = '+' + phone;

            const existing = await zite.customers.findOne({ filters: { phoneNumber: phone } });
            if (existing) {
              await zite.customers.update({
                id: existing.id,
                record: {
                  customerName: name,
                  email: row['Email'] || row['email'] || null,
                  address: row['Address'] || row['address'] || null,
                },
              });
              updated++;
            } else {
              await zite.customers.create({
                record: {
                  phoneNumber: phone,
                  customerName: name,
                  email: row['Email'] || row['email'] || null,
                  address: row['Address'] || row['address'] || null,
                  notes: null,
                },
              });
              imported++;
            }
          } catch (e: any) {
            errors.push(e.message || 'Unknown error');
          }
        }
        break;
      }
      case 'suppliers': {
        for (const row of input.rows) {
          try {
            const name = row['Supplier Name'] || row['supplierName'] || row['name'] || '';
            if (!name) { errors.push(`Row missing name`); continue; }

            const createdSupplier = await zite.suppliers.create({
              record: {
                supplierName: name,
                phone: row['Phone'] || row['phone'] || null,
                email: row['Email'] || row['email'] || null,
                address: row['Address'] || row['address'] || null,
                depositBalance: 0,
                notes: null,
              },
            });
            // Every supplier is also added as a Supplier-type location on the Addresses page.
            try { await syncSupplierAddress({ id: createdSupplier.id, supplierName: name, address: row['Address'] || row['address'] || null }); } catch {}
            imported++;
          } catch (e: any) {
            errors.push(e.message || 'Unknown error');
          }
        }
        break;
      }
    }

    return { imported, updated, errors: errors.slice(0, 10) };
  },
});
