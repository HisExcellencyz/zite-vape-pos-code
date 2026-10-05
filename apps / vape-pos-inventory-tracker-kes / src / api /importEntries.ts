import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getAccess } from '../lib/permissions';
import { parseEntryDate, todayEAT, dayEAT, resolveDateChange } from '../lib/entryDates';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const normRow = (r: Record<string, string>) => {
  const o: Record<string, string> = {};
  for (const [k, v] of Object.entries(r)) o[norm(k)] = String(v ?? '').trim();
  return o;
};
const parseNum = (s: string) => {
  const n = Number(String(s).replace(/,/g, '').replace(/^KES\s*/i, ''));
  return Number.isFinite(n) ? n : NaN;
};
const SALE_SUFFIX = /\s-\sSale\s#\d+$/;

export default createEndpoint({
  description: 'Bulk import Other Income or Other Expense entries from CSV rows. Rows with a Date other than today (backdated entries), and rows with an Entry Number (changing an existing entry), are only accepted from the Owner and Admin.',
  authenticated: true,
  inputSchema: z.object({
    kind: z.enum(['income', 'expenses']),
    rows: z.array(z.record(z.string())),
  }),
  outputSchema: z.object({ imported: z.number(), updated: z.number(), skipped: z.number(), errors: z.array(z.string()) }),
  execute: async ({ input, context }) => {
    if (input.rows.length > 1500) throw new Error('Too many rows. Import up to 1,500 rows at a time.');

    const isIncome = input.kind === 'income';
    const access = await getAccess(context.user.id);
    if (!access.can(isIncome ? 'income' : 'expenses', 'import')) {
      throw new Error('You do not have permission to import these entries. Ask an administrator to update your role.');
    }

    const errors: string[] = [];
    let imported = 0, updated = 0, skipped = 0;
    const table: any = isIncome ? zite.otherIncome : zite.otherExpenses;
    const tableName = isIncome ? 'OtherIncome' : 'OtherExpenses';
    const numField = isIncome ? 'incomeNumber' : 'expenseNumber';
    const dateField = isIncome ? 'incomeDate' : 'expenseDate';

    // Used to stop a dated file from being imported twice (same day + description + amount).
    const existing = await table.findAll({ limit: 2000 });
    const seen = new Set<string>(
      existing.records.map((e: any) => `${dayEAT(e[dateField] || new Date().toISOString())}|${(e.description || '').toLowerCase()}|${e.amount}`),
    );

    for (let i = 0; i < input.rows.length; i++) {
      const r = normRow(input.rows[i]);
      const line = i + 2;
      const label = `Row ${line}`;
      try {
        const numStr = r['entrynumber'] || r['number'] || '';
        const dateStr = r['date'] || '';
        const description = r['description'] || '';
        const amountStr = r['amount'] || '';
        const notes = r['notes'] || '';

        const pd = dateStr ? parseEntryDate(dateStr) : null;
        if (dateStr && !pd) { skipped++; errors.push(`${label}: invalid date "${dateStr}" (use YYYY-MM-DD or DD/MM/YYYY)`); continue; }

        // ── Change an existing entry ──
        if (numStr) {
          if (!access.canBackdate) { skipped++; errors.push(`${label}: only the Owner and Admin can change existing entries`); continue; }
          const n = Number(numStr);
          const found = Number.isFinite(n)
            ? await zite.sql({ query: `SELECT id, "${dateField}" AS "d", "description" AS "description" FROM "${tableName}" WHERE "${numField}" = $1`, params: [n] })
            : null;
          const row = found?.rows[0];
          if (!row) { skipped++; errors.push(`${label}: no entry numbered ${numStr}`); continue; }
          const record: Record<string, unknown> = {};
          if (pd) {
            const iso = resolveDateChange(pd.day, row.d ? String(row.d) : null, true);
            if (iso) record[dateField] = iso;
          }
          if (description) {
            let d = description;
            const oldSuffix = SALE_SUFFIX.exec(String(row.description || ''))?.[0];
            if (oldSuffix && !SALE_SUFFIX.test(d)) d += oldSuffix;
            record.description = d;
          }
          if (amountStr) {
            const a = parseNum(amountStr);
            if (!(a > 0)) { skipped++; errors.push(`${label}: invalid amount`); continue; }
            record.amount = a;
          }
          if (notes) record.notes = notes;
          if (Object.keys(record).length === 0) { skipped++; errors.push(`${label}: nothing to change for entry ${numStr}`); continue; }
          await table.update({ id: String(row.id), record });
          updated++;
          continue;
        }

        // ── New entry (optionally backdated) ──
        if (!description) { skipped++; errors.push(`${label}: Description is required`); continue; }
        const amount = parseNum(amountStr);
        if (!(amount > 0)) { skipped++; errors.push(`${label}: invalid amount`); continue; }

        let when = new Date().toISOString();
        if (pd && pd.day !== todayEAT()) {
          if (!access.canBackdate) { skipped++; errors.push(`${label}: only the Owner and Admin can import backdated entries (date ${pd.day})`); continue; }
          const key = `${pd.day}|${description.toLowerCase()}|${amount}`;
          if (seen.has(key)) { skipped++; errors.push(`${label}: an identical entry already exists on ${pd.day}, skipped`); continue; }
          seen.add(key);
          when = pd.iso;
        }

        await table.create({
          record: {
            [dateField]: when,
            description,
            amount,
            branch: null,
            notes: notes || null,
            createdBy: context.user.id,
          },
        });
        imported++;
      } catch (e: any) {
        skipped++;
        errors.push(`${label}: ${e.message || 'failed'}`);
      }
    }

    return { imported, updated, skipped, errors: errors.slice(0, 50) };
  },
});
