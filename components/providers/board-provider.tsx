'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { BoardState } from '@/lib/types';

/** Intervalo de atualização para quem está apenas visualizando */
const POLL_MS = 15_000;

interface BoardCtx {
  state: BoardState | null;
  error: string | null;
  saving: boolean;
  lastSync: Date | null;
  mutate: (fn: (s: BoardState) => BoardState) => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<BoardCtx | null>(null);

export function BoardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BoardState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const stateRef = useRef<BoardState | null>(null);
  const dirty = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  const refresh = useCallback(async () => {
    if (dirty.current) return; // não sobrescreve alterações locais ainda não salvas
    try {
      const r = await fetch('/api/state', { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      const s = (await r.json()) as BoardState;
      if (dirty.current) return;
      stateRef.current = s;
      setState(s);
      setLastSync(new Date());
      setError(null);
    } catch {
      setError('Falha ao sincronizar com o servidor');
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const persist = useCallback(async () => {
    const sent = stateRef.current;
    if (!sent) return;
    setSaving(true);
    try {
      const r = await fetch('/api/state', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(sent),
      });
      if (r.status === 401) {
        toast.error('Sessão expirada. Faça login novamente para salvar alterações.');
        dirty.current = false;
        await refresh();
        return;
      }
      if (!r.ok) throw new Error(String(r.status));
      const saved = (await r.json()) as BoardState;
      if (stateRef.current === sent) {
        dirty.current = false;
        stateRef.current = saved;
        setState(saved);
      }
      setLastSync(new Date());
    } catch {
      toast.error('Não foi possível salvar as alterações. Tentaremos novamente.');
      saveTimer.current = setTimeout(persist, 5000);
    } finally {
      setSaving(false);
    }
  }, [refresh]);

  // Garante o envio de alterações pendentes ao fechar/recarregar a aba
  useEffect(() => {
    const flush = () => {
      if (!dirty.current || !stateRef.current) return;
      clearTimeout(saveTimer.current);
      fetch('/api/state', {
        method: 'PUT',
        keepalive: true,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(stateRef.current),
      }).catch(() => {});
      dirty.current = false;
    };
    const onVisibility = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const mutate = useCallback(
    (fn: (s: BoardState) => BoardState) => {
      const cur = stateRef.current;
      if (!cur) return;
      const next = { ...fn(cur), updatedAt: new Date().toISOString() };
      stateRef.current = next;
      setState(next);
      dirty.current = true;
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(persist, 400);
    },
    [persist],
  );

  return <Ctx.Provider value={{ state, error, saving, lastSync, mutate, refresh }}>{children}</Ctx.Provider>;
}

export function useBoard() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useBoard precisa estar dentro de <BoardProvider>');
  return ctx;
}
