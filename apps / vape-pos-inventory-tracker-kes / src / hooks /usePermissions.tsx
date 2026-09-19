import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getMyPermissions } from 'zitejs/api';

type PermMatrix = Record<string, Record<string, boolean>>;

interface PermContextType {
  permissions: PermMatrix;
  roleName: string;
  loading: boolean;
  can: (area: string, action: string) => boolean;
}

const PermContext = createContext<PermContextType>({
  permissions: {},
  roleName: '',
  loading: true,
  can: () => false,
});

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const [permissions, setPermissions] = useState<PermMatrix>({});
  const [roleName, setRoleName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyPermissions({})
      .then(res => {
        setPermissions(res.permissions || {});
        setRoleName(res.roleName || '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const can = (area: string, action: string) => {
    return permissions[area]?.[action] === true;
  };

  return (
    <PermContext.Provider value={{ permissions, roleName, loading, can }}>
      {children}
    </PermContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermContext);
}
