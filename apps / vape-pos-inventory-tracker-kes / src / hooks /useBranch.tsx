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
  /** Default delivery fee charged per order at this outlet (KES). */
  deliveryFee?: number;
  commissions?: Commission[];
}

export interface Commission { name: string; type: 'percent' | 'fixed'; value: number }

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
