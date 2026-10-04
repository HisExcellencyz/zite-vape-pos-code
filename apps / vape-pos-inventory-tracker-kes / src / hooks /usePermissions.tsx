import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { getMyPermissions } from 'zitejs/api';
import { setTemplateBackdate } from '../lib/exportHelper';

type PermMatrix = Record<string, Record<string, boolean>>;

interface PermContextType {
  permissions: PermMatrix;
  roleName: string;
  /** True when the signed-in user has no role yet (waiting for an admin). */
  pending: boolean;
  /** True for the Owner and Admin only: may change dates and create backdated entries. */
  canBackdate: boolean;
  loading: boolean;
  can: (area: string, action: string) => boolean;
  refresh: () => Promise<void>;
}

const PermContext = createContext<PermContextType>({
  permissions: {},
  roleName: '',
  pending: false,
  canBackdate: false,
  loading: true,
  can: () => false,
  refresh: async () => {},
});

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const [permissions, setPermissions] = useState<PermMatrix>({});
  const [roleName, setRoleName] = useState('');
  const [pending, setPending] = useState(false);
  const [canBackdate, setCanBackdate] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await getMyPermissions({});
      setPermissions((res.permissions as PermMatrix) || {});
      setRoleName(res.roleName || '');
      setPending(!!res.pending);
      setCanBackdate(!!res.canBackdate);
      setTemplateBackdate(!!res.canBackdate);
    } catch {
      setPermissions({});
      setPending(true);
      setCanBackdate(false);
      setTemplateBackdate(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const can = (area: string, action: string) => permissions[area]?.[action] === true;

  const refresh = async () => { setLoading(true); await load(); };

  return (
    <PermContext.Provider value={{ permissions, roleName, pending, canBackdate, loading, can, refresh }}>
      {children}
    </PermContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermContext);
}
