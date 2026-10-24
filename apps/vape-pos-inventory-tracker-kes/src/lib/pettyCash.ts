import { zite } from 'zitejs/db';

// Petty cash is a ledger per outlet: top-ups are stored as positive amounts,
// withdrawals and supplier bill payments as negative amounts. The balance is the sum.

const round = (n: number) => Math.round(n * 100) / 100;

/** Current petty cash balance of every outlet, keyed by branch id. */
export async function pettyCashBalances(): Promise<Record<string, number>> {
  const res = await zite.sql({
    query: `SELECT bp."branchesId" AS branch, COALESCE(SUM(p."amount"), 0) AS total
            FROM "PettyCash" p
            LEFT JOIN "BranchesPettyCash" bp ON bp."pettyCashId" = p.id
            GROUP BY bp."branchesId"`,
  });
  const out: Record<string, number> = {};
  for (const row of res.rows) out[String(row.branch ?? '')] = round(Number(row.total || 0));
  return out;
}

export async function pettyCashBalance(branchId: string) {
  return (await pettyCashBalances())[branchId] || 0;
}

export const fmtKes = (n: number) => `KES ${n.toLocaleString()}`;
