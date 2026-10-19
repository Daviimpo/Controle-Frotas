'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Columns3, Eye, LogIn, Radio, Search, X } from 'lucide-react';
import { PlanilhaBoard } from '@/components/board/planilha-board';
import { useAuth } from '@/components/providers/auth-provider';
import { useBoard } from '@/components/providers/board-provider';
import { Button, Input, PageHeader, Skeleton } from '@/components/ui';
import { ALERT_CELL, MACRO_ORDER, MACROS, STALE_HOURS } from '@/lib/macro';
import { vehicleAlert } from '@/lib/board-ops';
import { cn, formatDateTime } from '@/lib/utils';

export default function QuadroPage() {
  return (
    <Suspense fallback={<BoardSkeleton />}>
      <Quadro />
    </Suspense>
  );
}

function Quadro() {
  const params = useSearchParams();
  const { state, lastSync } = useBoard();
  const { isEditor, openLogin } = useAuth();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [onlyAlerts, setOnlyAlerts] = useState(params.get('alertas') === '1');

  useEffect(() => {
    const q = params.get('q');
    if (q) setSearch(q);
  }, [params]);

  if (!state) return <BoardSkeleton />;
  const alertCount = state.vehicles.filter((v) => vehicleAlert(state, v)).length;

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Columns3 className="h-5 w-5" />}
        title="Quadro de Frotas"
        description={
          <span className="inline-flex items-center gap-1.5">
            <Radio className="h-3.5 w-3.5 text-emerald-500" /> Atualização automática · última sincronização{' '}
            {lastSync ? lastSync.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
            {state.updatedBy && <span className="hidden sm:inline">· alterado por {state.updatedBy} em {formatDateTime(state.updatedAt)}</span>}
          </span>
        }
        actions={
          <>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input className="pl-8 pr-8" placeholder="Buscar frota, placa ou motorista" value={search} onChange={(e) => setSearch(e.target.value)} />
              {search && (
                <button className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-700" onClick={() => setSearch('')} aria-label="Limpar busca">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button variant={onlyAlerts ? 'primary' : 'secondary'} onClick={() => setOnlyAlerts((x) => !x)}>
              <AlertTriangle className={cn('h-4 w-4', !onlyAlerts && 'text-amber-500')} />
              Alertas de macro <span className="rounded bg-amber-100 px-1.5 text-xs font-bold text-amber-800">{alertCount}</span>
            </Button>
          </>
        }
      />

      {!isEditor && (
        <div className="flex flex-col gap-2 rounded-lg border border-brand-100 bg-brand-50 px-4 py-2.5 text-sm text-brand sm:flex-row sm:items-center">
          <Eye className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            <b>Modo leitura.</b> Você está vendo a posição das frotas em tempo real. Para mover frotas e editar programações, faça login.
          </span>
          <Button size="sm" onClick={openLogin}>
            <LogIn className="h-3.5 w-3.5" /> Entrar
          </Button>
        </div>
      )}

      <Legend />
      <PlanilhaBoard search={search} onlyAlerts={onlyAlerts} />
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs text-slate-600 shadow-sm">
      <span className="font-semibold text-slate-500">Cores (macro do rastreador):</span>
      {MACRO_ORDER.map((m) => (
        <span key={m} className={cn('rounded-sm border border-slate-200 px-2 py-0.5 text-[11px] font-semibold', MACROS[m].cell)}>
          {MACROS[m].label}
        </span>
      ))}
      <span className="hidden h-4 w-px bg-slate-200 sm:block" />
      <span className={cn('rounded-sm px-2 py-0.5 text-[11px] font-semibold', ALERT_CELL)}>Alerta</span>
      <span className="text-slate-500">macro sem atualizar há +{STALE_HOURS}h ou incompatível com a posição</span>
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-72" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white p-3">
          {[0, 1, 2, 3, 4].map((j) => (
            <Skeleton key={j} className="h-40 w-[272px] shrink-0" />
          ))}
        </div>
      ))}
    </div>
  );
}
