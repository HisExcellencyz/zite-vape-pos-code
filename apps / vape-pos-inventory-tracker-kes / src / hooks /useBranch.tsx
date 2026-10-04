import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { getBranches } from 'zitejs/api';

export interface Branch {
  id: string;
  branchName?: string;
  address?: string;
  phone?: string;
  taxId?: string;
  isMainBranch?: boolean;
  active?: boolean;
  plusCode?: string;
  coordinates?: string;
  logoUrl?: string;
  coverPhotoUrl?: string;
  /** Legacy default delivery fee (KES). The first entry of `incomes` is now the delivery fee. */
  deliveryFee?: number;
  /** Deductions / commissions (e.g. Glovo). */
  commissions?: Commission[];
  /** Incomes & revenues charged on top of an order. The first one is the Delivery Fee. */
  incomes?: Commission[];
}

export interface Commission {
  name: string;
  type: 'percent' | 'fixed';
  value: number;
  /** When on, the item is applied automatically to every POS order (it can be switched off per order). */
  enabled?: boolean;
}

/**
 * Whether an income / deduction is switched on in Settings.
 * Items saved before the toggle existed have no flag: "Glovo" counts as on, everything else as off.
 */
export const autoOn = (c: Commission) => c.enabled ?? /^\s*glovo\s*$/i.test(c.name || '');

export const commissionAmount = (c: Commission, base: number) =>
  Math.round((c.type === 'percent' ? (base * c.value) / 100 : c.value) * 100) / 100;

interface BranchContextType {
  branches: Branch[];
  currentBranch: Branch | null;
  setCurrentBranchId: (id: string) => void;
  loading: boolean;
  refresh: () => Promise<void>;
}

const BranchContext = createContext<BranchContextType>({
  branches: [],
  currentBranch: null,
  setCurrentBranchId: () => {},
  loading: true,
  refresh: async () => {},
});

const STORAGE_KEY = 'currentOutletId';

export function BranchProvider({ children }: { children: ReactNode }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [currentBranchId, setCurrentBranchIdState] = useState<string | null>(() => {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getBranches({});
      const list = (res.branches as Branch[]) || [];
      setBranches(list);
      setCurrentBranchIdState(prevId => {
        const stillExists = list.find(b => b.id === prevId);
        if (stillExists) return prevId;
        const main = list.find(b => b.isMainBranch) || list[0];
        if (main) {
          try { localStorage.setItem(STORAGE_KEY, main.id); } catch {}
          return main.id;
        }
        return prevId;
      });
    } catch {
      setBranches([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setCurrentBranchId = (id: string) => {
    setCurrentBranchIdState(id);
    try { localStorage.setItem(STORAGE_KEY, id); } catch {}
  };

  const currentBranch = branches.find(b => b.id === currentBranchId) || branches[0] || null;

  return (
    <BranchContext.Provider value={{ branches, currentBranch, setCurrentBranchId, loading, refresh: load }}>
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  return useContext(BranchContext);
}
