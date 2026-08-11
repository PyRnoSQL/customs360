import React, { createContext, useContext, useState, useCallback } from 'react';

export type Role = 'admin' | 'dg' | 'dir_info' | 'dir_secteur' | 'ip';

export interface User {
  username: string;
  role: Role;
  displayName: string;
  roleLabel: string;
}

const USERS: Record<string, { pin: string; displayName: string; roleLabel: string; role: Role }> = {
  admin:       { pin: '1234', role: 'admin',       displayName: 'Super Administrateur', roleLabel: 'SUPER ADMINISTRATEUR' },
  dg:          { pin: '1234', role: 'dg',          displayName: 'Directeur Général',    roleLabel: 'DIRECTEUR GÉNÉRAL' },
  dir_info:    { pin: '1234', role: 'dir_info',    displayName: 'Dir. Informatique',    roleLabel: 'DIRECTEUR INFORMATIQUE' },
  dir_secteur: { pin: '1234', role: 'dir_secteur', displayName: 'Chef Secteur',         roleLabel: 'CHEF SECTEUR' },
  ip:          { pin: '1234', role: 'ip',          displayName: 'Inspecteur Principal', roleLabel: 'INSPECTEUR PRINCIPAL' },
};

// Pages each role can access (by path)
export const ROLE_PAGES: Record<Role, string[]> = {
  admin:       ['/welcome','/','/importers','/fraud','/delays','/offices','/graph','/officers','/advanced'],
  dg:          ['/welcome','/','/importers','/fraud','/delays','/offices','/graph','/officers','/advanced'],
  dir_info:    ['/welcome','/','/importers','/fraud','/delays','/offices','/graph','/officers','/advanced'],
  dir_secteur: ['/welcome','/','/importers','/fraud','/delays','/offices','/graph','/officers','/advanced'],
  ip:          ['/welcome','/importers','/offices','/officers'],
};

interface AuthCtx {
  user: User | null;
  login: (username: string, pin: string) => boolean;
  logout: () => void;
  canAccess: (path: string) => boolean;
}

const Ctx = createContext<AuthCtx>({ user: null, login: () => false, logout: () => {}, canAccess: () => false });
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  const login = useCallback((username: string, pin: string): boolean => {
    const key = username.toLowerCase().trim();
    const record = USERS[key];
    if (!record || record.pin !== pin) return false;
    setUser({ username: key, role: record.role, displayName: record.displayName, roleLabel: record.roleLabel });
    return true;
  }, []);

  const logout = useCallback(() => setUser(null), []);

  const canAccess = useCallback((path: string) => {
    if (!user) return false;
    return ROLE_PAGES[user.role].includes(path);
  }, [user]);

  return <Ctx.Provider value={{ user, login, logout, canAccess }}>{children}</Ctx.Provider>;
}
