import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Me, MeResponse } from '../../shared/auth';
import { send } from './api';

type AuthValue = {
  user: Me | null;
  ready: boolean; // false until the first /api/me answer
  setUser: (user: Me | null) => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/me', { headers: { Accept: 'application/json' } });
      const body = (await res.json()) as MeResponse;
      setUser(body.user);
    } catch {
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await send('/api/auth/signout', 'POST');
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, ready, setUser, refresh, signOut }), [user, ready, refresh, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
