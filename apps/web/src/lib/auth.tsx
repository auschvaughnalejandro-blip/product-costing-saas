import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';
import type { User } from './api';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['me'], queryFn: api.me, staleTime: 60_000 });

  const login = useCallback(
    async (email: string, password: string) => {
      qc.setQueryData(['me'], await api.login(email, password));
    },
    [qc],
  );
  const register = useCallback(
    async (email: string, name: string, password: string) => {
      qc.setQueryData(['me'], await api.register(email, name, password));
    },
    [qc],
  );
  const logout = useCallback(async () => {
    await api.logout();
    qc.setQueryData(['me'], null);
    qc.clear();
  }, [qc]);

  return (
    <AuthContext.Provider value={{ user: data ?? null, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
