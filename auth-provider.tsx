'use client';

import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Lock, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import type { Session } from '@/lib/types';
import { Button, Dialog, Input, Label } from '@/components/ui';

interface AuthCtx {
  session: Session | null;
  loading: boolean;
  isEditor: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  openLogin: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { session: Session | null }) => setSession(d.session))
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!r.ok) return false;
    const d = (await r.json()) as { session: Session };
    setSession(d.session);
    return true;
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setSession(null);
    toast('Sessão encerrada — modo leitura ativado');
  }, []);

  const openLogin = useCallback(() => setDialog(true), []);

  return (
    <Ctx.Provider value={{ session, loading, isEditor: !!session, login, logout, openLogin }}>
      {children}
      <LoginDialog open={dialog} onClose={() => setDialog(false)} login={login} />
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}

function LoginDialog({ open, onClose, login }: { open: boolean; onClose: () => void; login: AuthCtx['login'] }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const ok = await login(username, password);
    setBusy(false);
    if (!ok) return setError('Usuário ou senha inválidos.');
    toast.success(`Bem-vindo, ${username}! Modo edição liberado.`);
    setPassword('');
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} size="sm" title="Entrar no Controle de Frotas" description="Acesso restrito a administradores e operadores.">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="login-user">Usuário</Label>
          <Input id="login-user" autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="login-pass">Senha</Label>
          <Input id="login-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy || !username || !password}>
          <LogIn className="h-4 w-4" /> {busy ? 'Entrando…' : 'Entrar'}
        </Button>
        {process.env.NODE_ENV !== 'production' && (
          <p className="flex items-start gap-1.5 rounded-md bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
            <Lock className="mt-0.5 h-3 w-3 shrink-0" />
            Ambiente de desenvolvimento: <b className="font-semibold">admin / polivias@2026</b>. Configure usuários reais em <code>POLIVIAS_USERS</code>.
          </p>
        )}
      </form>
    </Dialog>
  );
}
