'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Clock, FileText, Globe, LayoutDashboard, MapPin, Navigation, PackageOpen, RotateCcw, Search, Truck, Warehouse } from 'lucide-react';
import { useBoard } from '@/components/providers/board-provider';
import { FrotaBadge } from '@/components/board/frota-badge';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, PageHeader, Skeleton } from '@/components/ui';
import { columnCount, locationLabel, sectionCount, unassignedVehicles, vehicleAlert } from '@/lib/board-ops';
import { MACROS } from '@/lib/macro';
import { SEM_PROGRAMACAO } from '@/lib/mock-data';
import { columnLabel, orderColumns } from '@/lib/planilha-layout';
import type { BoardState } from '@/lib/types';
import { cn, formatPlate, normalizePlate, normalizeText, timeAgo } from '@/lib/utils';

export default function DashboardPage() {
  const { state } = useBoard();
  if (!state) return <DashboardSkeleton />;
  return <Dashboard state={state} />;
}

function Dashboard({ state }: { state: BoardState }) {
  const alerts = useMemo(
    () =>
      state.vehicles
        .map((v) => ({ v, alert: vehicleAlert(state, v) }))
        .filter((x) => x.alert)
        .sort((a, b) => (a.alert!.type === b.alert!.type ? 0 : a.alert!.type === 'mismatch' ? -1 : 1)),
    [state],
  );

  const count = (id: string) => columnCount(state, id);
  const kpis = [
    { label: 'Frotas cadastradas', value: state.vehicles.length, icon: Truck, tone: 'bg-navy text-white' },
    { label: 'Em exportação', value: sectionCount(state, 'exportacao'), icon: Globe, tone: 'bg-brand-50 text-brand' },
    { label: 'Em importação', value: sectionCount(state, 'importacao'), icon: PackageOpen, tone: 'bg-emerald-50 text-emerald-700' },
    { label: 'A caminho / aguardando', value: count('a-caminho') + count('aguardando'), icon: Navigation, tone: 'bg-sky-50 text-sky-700' },
    { label: 'Voltando', value: count('voltando'), icon: RotateCcw, tone: 'bg-indigo-50 text-indigo-700' },
    { label: 'Sem programação', value: unassignedVehicles(state).length, icon: Warehouse, tone: 'bg-slate-100 text-slate-700' },
  ];

  const programacoes = state.groups
    .filter((g) => (g.programacao || g.crt) && g.frotaIds.length)
    .map((g) => ({ g, col: state.columns.find((c) => c.id === g.columnId)! }))
    .filter((x) => x.col && x.col.section !== 'status');

  const distribution = orderColumns(state.columns)
    .filter((c) => c.id !== SEM_PROGRAMACAO)
    .map((c) => ({ c, n: count(c.id) }));
  const max = Math.max(1, ...distribution.map((d) => d.n));
  const vehicleById = new Map(state.vehicles.map((v) => [v.id, v]));

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<LayoutDashboard className="h-5 w-5" />}
        title="Dashboard"
        description={`Visão geral das ${state.vehicles.length} frotas Polivias no Mercosul`}
        actions={
          <Link href="/quadro" className="inline-flex h-9 items-center gap-2 rounded-md bg-navy px-4 text-sm font-medium text-white shadow-sm hover:bg-navy-600">
            Abrir Quadro de Frotas <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <Card key={k.label} className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">{k.label}</span>
              <span className={cn('grid h-7 w-7 place-items-center rounded-md', k.tone)}>
                <k.icon className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-2 text-3xl font-bold tabular-nums text-navy">{k.value}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Distribuição no quadro</CardTitle>
                <CardDescription>Quantidade de frotas por destino / status</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {distribution.map(({ c, n }) => (
                <div key={c.id} className="flex items-center gap-3 text-sm">
                  <span className="w-44 shrink-0 truncate text-slate-600" title={columnLabel(c)}>{columnLabel(c).replace('Porto Alegre › ', '')}</span>
                  <div className="h-5 flex-1 rounded bg-slate-100">
                    <div
                      className={cn('h-5 rounded', c.section === 'exportacao' ? 'bg-navy' : c.section === 'importacao' ? 'bg-emerald-600' : 'bg-slate-400')}
                      style={{ width: `${(n / max) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 text-right font-semibold tabular-nums text-slate-800">{n}</span>
                </div>
              ))}
              <div className="flex gap-4 pt-2 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-navy" /> Exportação</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-slate-400" /> Status</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-600" /> Importação</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Programações ativas</CardTitle>
                <CardDescription>Blocos de Programação + CRT com frotas alocadas</CardDescription>
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-2.5">Destino</th>
                    <th className="px-3 py-2.5">Programação</th>
                    <th className="px-3 py-2.5">CRT</th>
                    <th className="px-3 py-2.5">Cliente</th>
                    <th className="px-5 py-2.5">Frotas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {programacoes.map(({ g, col }) => (
                    <tr key={g.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-2.5">
                        <div className="font-medium text-slate-800">{columnLabel(col)}</div>
                        <div className="text-[11px] text-slate-400">{col.section === 'exportacao' ? 'Exportação' : 'Importação'}</div>
                      </td>
                      <td className="px-3 py-2.5 font-semibold tabular-nums">{g.programacao ?? '—'}</td>
                      <td className="px-3 py-2.5">
                        {g.crt ? (
                          <span className="inline-flex items-center gap-1 font-semibold tabular-nums text-navy">
                            <FileText className="h-3.5 w-3.5 text-slate-400" /> {g.crt}
                          </span>
                        ) : (
                          '—'
                        )}
                        {g.label && <div className="text-[11px] text-slate-400">{g.label}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{g.cliente ?? '—'}</td>
                      <td className="px-5 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {g.frotaIds.map((id) => (
                            <Link key={id} href={`/quadro?q=${vehicleById.get(id)?.frota ?? ''}`} className="hover:opacity-80">
                              <FrotaBadge numero={vehicleById.get(id)?.frota ?? ''} macro={vehicleById.get(id)?.macro} className="px-2 py-0.5" />
                            </Link>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <LocateCard state={state} />

          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" /> Alertas de macro
                </CardTitle>
                <CardDescription>Status do rastreador desatualizado ou incompatível</CardDescription>
              </div>
              <Badge variant={alerts.length ? 'warning' : 'success'}>{alerts.length}</Badge>
            </CardHeader>
            <div className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto">
              {alerts.length === 0 && <p className="p-5 text-sm text-slate-500">Nenhum alerta. Todos os macros estão em dia.</p>}
              {alerts.map(({ v, alert }) => (
                <Link key={v.id} href={`/quadro?q=${v.frota}`} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50">
                  <span className={cn('mt-0.5 rounded-md px-1.5 py-0.5 text-xs font-bold', alert!.type === 'mismatch' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800')}>
                    {v.frota}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-slate-700">{locationLabel(state, v.id)}</div>
                    <div className="text-[11px] text-slate-500">{alert!.message}</div>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-[11px] text-slate-400">
                    <Clock className="h-3 w-3" /> {timeAgo(v.macroUpdatedAt).replace('há ', '')}
                  </span>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function LocateCard({ state }: { state: BoardState }) {
  const [q, setQ] = useState('');
  const nq = normalizeText(q);
  const np = normalizePlate(q);
  const results = !nq
    ? []
    : state.vehicles
        .filter(
          (v) =>
            v.frota.startsWith(nq) ||
            normalizeText(v.motorista).includes(nq) ||
            (np.length >= 3 && (normalizePlate(v.placaCavalo).includes(np) || normalizePlate(v.placaCarreta).includes(np))),
        )
        .slice(0, 6);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-brand" /> Onde está a frota?
          </CardTitle>
          <CardDescription>Busque por número, placa ou motorista</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input className="pl-8" placeholder="Ex: 161 ou OAD-5041" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {q && results.length === 0 && <p className="pt-1 text-xs text-slate-500">Nenhuma frota encontrada.</p>}
        {results.map((v) => (
          <Link key={v.id} href={`/quadro?q=${v.frota}`} className="flex items-center gap-3 rounded-lg border border-slate-200 p-2.5 hover:border-brand hover:bg-brand-50/40">
            <span className="rounded-md bg-navy px-2 py-1 text-xs font-bold text-white">{v.frota}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-slate-800">{locationLabel(state, v.id)}</div>
              <div className="truncate text-[11px] text-slate-500">
                {formatPlate(v.placaCavalo)} · {v.motorista}
              </div>
            </div>
            <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset', MACROS[v.macro].badge)}>{MACROS[v.macro].label}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}
