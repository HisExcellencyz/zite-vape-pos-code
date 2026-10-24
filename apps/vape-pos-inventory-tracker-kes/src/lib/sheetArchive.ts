// Merges app records into fixed Google Sheets tabs (one tab per table).
// Rows are matched by an ID column: existing rows are updated in place, new rows are appended,
// and rows no longer in the app (e.g. removed after archiving) are kept, so each tab builds up a full history.

type Cell = string | number | boolean;
export type TabRows = Record<string, Record<string, unknown>[]>;

const ARCHIVED_AT = 'Archived At';

const toCell = (v: unknown): Cell => {
  if (v == null) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' ? (x as { url?: string }).url ?? JSON.stringify(x) : String(x))).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

async function gs(token: string, url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    if (res.status === 403 || res.status === 404)
      throw new Error(`Google Sheets can't open the archive spreadsheet (${res.status}). Share it as Editor with the Google account connected to Zite, and pick it in Zite's Google Sheets connection.`);
    throw new Error(`Google Sheets error (${res.status}): ${body}`);
  }
  return res.json();
}

export async function mergeIntoTabs(token: string, spreadsheetId: string, tabs: TabRows, idCol: string) {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
  const titles = Object.keys(tabs);

  // Create any tab that doesn't exist yet (never creates dated copies)
  const meta = await gs(token, `${base}?fields=sheets.properties.title`);
  const existing = new Set<string>((meta.sheets ?? []).map((s: { properties: { title: string } }) => s.properties.title));
  const missing = titles.filter((t) => !existing.has(t));
  if (missing.length)
    await gs(token, `${base}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests: missing.map((title) => ({ addSheet: { properties: { title } } })) }) });

  const ranges = titles.map((t) => `ranges=${encodeURIComponent(`'${t}'`)}`).join('&');
  const current = await gs(token, `${base}/values:batchGet?${ranges}&valueRenderOption=UNFORMATTED_VALUE`);

  const stamp = new Date().toISOString();
  const stats = { added: 0, updated: 0, kept: 0 };
  const writes: { range: string; values: Cell[][] }[] = [];
  const clears: string[] = [];

  titles.forEach((title, i) => {
    const old: unknown[][] = current.valueRanges?.[i]?.values ?? [];
    const oldHeader = (old[0] ?? []).map((h) => String(h));
    const header = [...oldHeader];
    const addCol = (k: string) => { if (!header.includes(k)) header.push(k); };
    addCol(idCol);
    for (const r of tabs[title]) Object.keys(r).forEach(addCol);
    addCol(ARCHIVED_AT);

    const idIdx = oldHeader.indexOf(idCol);
    const byId = new Map<string, Record<string, unknown>>();
    const order: string[] = [];
    const noId: Record<string, unknown>[] = [];
    for (const line of old.slice(1)) {
      const obj = Object.fromEntries(oldHeader.map((h, j) => [h, line[j] ?? '']));
      const id = idIdx >= 0 ? String(line[idIdx] ?? '').trim() : '';
      if (id) { if (!byId.has(id)) order.push(id); byId.set(id, obj); }
      else if (line.some((v) => v !== '' && v != null)) noId.push(obj);
    }

    const seen = new Set<string>();
    for (const r of tabs[title]) {
      const id = String(r[idCol] ?? '').trim();
      if (!id) continue;
      seen.add(id);
      if (byId.has(id)) stats.updated++; else { stats.added++; order.push(id); }
      byId.set(id, { ...byId.get(id), ...r, [ARCHIVED_AT]: stamp });
    }
    stats.kept += order.filter((id) => !seen.has(id)).length;

    const values: Cell[][] = [header, ...[...order.map((id) => byId.get(id)!), ...noId].map((o) => header.map((h) => toCell(o[h])))];
    writes.push({ range: `'${title}'!A1`, values });
    // Remove anything left below the merged block (only happens when duplicate IDs were collapsed)
    if (old.length > values.length) clears.push(`'${title}'!A${values.length + 1}:ZZ`);
  });

  // Write first, then trim — the sheet is never left empty if a request fails
  await gs(token, `${base}/values:batchUpdate`, { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data: writes }) });
  if (clears.length) await gs(token, `${base}/values:batchClear`, { method: 'POST', body: JSON.stringify({ ranges: clears }) });

  return { ...stats, url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}` };
}
