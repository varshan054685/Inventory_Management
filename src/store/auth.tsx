import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from '@/api/client';
import { toast } from '@/components/ui';

interface AuthUser {
  id: number;
  username: string;
  role: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  needsSetup: boolean;
  locked: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  setup: (username: string, password: string) => Promise<void>;
  lock: () => void;
  unlock: (username: string, password: string) => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
}

const Ctx = createContext<AuthContextValue | null>(null);

// For the web-dev fallback, remember session in memory only (no persistence).
let memUser: AuthUser | null = null;
let memLocked = false;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(memUser);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [locked, setLockedState] = useState(memLocked);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const has = await api.auth.hasUsers();
        setNeedsSetup(!has);
        if (!has) {
          memUser = null;
          setUser(null);
        }
      } catch (err) {
        toast((err as Error).message, 'error');
        // If backend is unavailable, allow entry for UI inspection? No—gate it.
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (username: string, password: string) => {
    const u = await api.auth.login(username, password);
    memUser = u;
    setUser(u);
  };

  const logout = () => {
    memUser = null;
    setUser(null);
  };

  const setup = async (username: string, password: string) => {
    const u = await api.auth.setup(username, password);
    memUser = u;
    setUser(u);
    setNeedsSetup(false);
  };

  const lock = () => {
    void api.auth.lock();
    memLocked = true;
    setLockedState(true);
  };

  const unlock = async (username: string, password: string) => {
    await api.auth.unlock(username, password);
    memLocked = false;
    setLockedState(false);
  };

  const changePassword = async (current: string, next: string) => {
    if (!memUser) throw new Error('Not logged in');
    await api.auth.changePassword(memUser.id, current, next);
  };

  return (
    <Ctx.Provider value={{ user, loading, needsSetup, locked, login, logout, setup, lock, unlock, changePassword }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}