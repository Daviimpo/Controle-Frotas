'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, FileText, FileUp, Info, Loader2, Lock, LogIn, RotateCcw, Sparkles, TriangleAlert, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/components/providers/auth-provider';
import { useBoard } from '@/components/providers/board-provider';
import { FrotaBadge, MacroLabel } from '@/components/board/frota-badge';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, PageHeader, Select } from '@/components/ui';
import { groupTitle, locate } from '@/lib/board-ops';
import { MACRO_ORDER, MACROS } from '@/lib/macro';
import { SEM_PROGRAMACAO } from '@/lib/mock-data';
import { destinoToColumnId } from '@/lib/pdf/planilla';
import type { BoardState, ExtractionResult, Macro } from '@/lib/types';
import { cn, formatPlate } from '@/lib/utils';

type Step = 'idle' | 'processing' | 'review' | 'done';
type Tipo = 'exportacao' | 'importacao';

interface ReviewRow {
  key: string;
  include: boolean;
  placaCavalo: string;
  placaCarreta: string;
  motorista: string;
  vehicleId: string;
  matchedBy: 'cavalo' | 'carreta' | null;
  crtOriginal: string;
  crt: string;
  programacao: string;
  destino: string;
  columnId: string;
  cliente: string;
  clienteDestino: string;
}

const STEPS = ['Lendo o documento (PDF / TXT)', 'Programação e CONOCIMIENTO (CRT)', 'CAMION / SEMI-REMOLQUE, cliente e destino', 'Cruzando placas com a tabela de frotas'];

const SOURCE_LABEL: Record<ExtractionResult['source'], { text: string; variant: 'success' | 'brand' | 'warning' }> = {
  texto: { text: 'Lido do texto direto (PDF/TXT)', variant: 'success' },
  claude: { text: 'Lido por IA (Claude)', variant: 'brand' },
  exemplo: { text: 'Exemplo', variant: 'warning' },
};

export default function ImportarPdfPage() {
  const { isEditor, openLogin, loading } = useAuth();
  const { state, serverAction } = useBoard();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('idle');
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [tipo, setTipo] = useState<Tipo>('exportacao');
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [macro, setMacro] = useState<Macro>('viagem');
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<{ frotas: number; blocos: number } | null>(null);

  async function handleFile(file: File | null) {
    if (!state) return;

    if (file) {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const isTxt = file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt');
      if (!isPdf && !isTxt) {
        toast.error('Envie um arquivo em formato PDF ou TXT.');
        return;
      }
    }

    setFileName(file?.name ?? 'Exemplo — Planilla de Programación Nº 388/2026');
    setStep('processing');
    setProgress(0);
    const timer = setInterval(() => setProgress((p) => Math.min(p + 1, STEPS.length - 1)), 700);

    try {
      const fd = new FormData();
      if (file) fd.append('file', file);
      else fd.append('demo', '1');
      const [res] = await Promise.all([fetch('/api/extract-pdf', { method: 'POST', body: fd }), new Promise((r) => setTimeout(r, 2200))]);
      const data = (await res.json()) as ExtractionResult & { error?: string };
      if (!res.ok) throw new Error(data.error || 'Falha ao processar o arquivo');
      setProgress(STEPS.length);
      buildReview(data);
      setStep('review');
      if (data.warning) toast.warning(data.warning);
    } catch (err) {
      toast.error('Não foi possível ler o arquivo', { description: err instanceof Error ? err.message : undefined, duration: 10000 });
      setStep('idle');
    } finally {
      clearInterval(timer);
    }
  }

  function buildReview(data: ExtractionResult) {
    setResult(data);
    const currentTipo: Tipo = 'exportacao';
    setTipo(currentTipo);

    // Encontra uma coluna padrão válida para alocação no quadro
    const defaultColumn = state?.columns.find((c) => c.section === currentTipo && c.id !== SEM_PROGRAMACAO)?.id || state?.columns[0]?.id || 'zarate';

    setRows(
      data.rows.map((r, i) => {
        const matchedColId = destinoToColumnId(r.destino, state?.columns || [], currentTipo) || defaultColumn;
        const cli = String(r.cliente ?? 'VITOPEL');
        const dest = String(r.destino ?? 'CORDOBA');
        return {
          key: `r${i}`,
          include: !!r.vehicleId,
          placaCavalo: r.placaCavalo,
          placaCarreta: String(r.placaCarreta ?? ''),
          motorista: String(r.motorista ?? ''),
          vehicleId: r.vehicleId ?? '',
          matchedBy: r.matchedBy ?? null,
          crtOriginal: String(r.conocimiento ?? ''),
          crt: String(r.crt ?? ''),
          programacao: String(r.programacao ?? data.programacao ?? ''),
          destino: dest,
          columnId: matchedColId,
          cliente: cli,
          clienteDestino: `${cli} / ${dest}`,
        };
      }),
    );
  }

  function changeTipo(t: Tipo) {
    if (!state) return;
    setTipo(t);
    setRows((rs) => rs.map((r) => ({ ...r, columnId: destinoToColumnId(r.destino, state.columns, t) || state.columns[0]?.id })));
  }

  const update = (key: string, patch: Partial<ReviewRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // A linha pronta precisa ter include=true, vehicleId (frota associada) e columnId
  const ready = rows.filter((r) => r.include && r.vehicleId && r.columnId);

  const blocks = useMemo(() => {
    const map = new Map<string, { columnId: string; programacao: string; crt: string; cliente: string; frotas: string[] }>();
    for (const r of ready) {
      const k = `${r.programacao}|${r.crt}`;
      const b = map.get(k) ?? { columnId: r.columnId, programacao: r.programacao, crt: r.crt, cliente: r.clienteDestino, frotas: [] };
      if (!b.frotas.includes(r.vehicleId)) b.frotas.push(r.vehicleId);
      map.set(k, b);
    }
    return Array.from(map.values());
  }, [ready]);

  async function confirm() {
    setSaving(true);
    try {
      const r = await serverAction<{ state: BoardState; frotas: number; blocos: number }>('/api/pdf/confirm', {
        method: 'POST',
        body: {
          macro,
          allocations: ready.map((x) => ({ vehicleId: x.vehicleId, columnId: x.columnId, programacao: x.programacao, crt: x.crt, cliente: x.clienteDestino })),
        },
      });
      setSummary({ frotas: r.frotas, blocos: r.blocos });
      setStep('done');
      toast.success(`${r.frotas} frota(s) alocadas no quadro.`);
    } catch (err) {
      toast.error('A programação não foi salva.', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setStep('idle');
    setRows([]);
    setResult(null);
    setSummary(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  const header = (
    <PageHeader
      icon={<FileUp className="h-5 w-5" />}
      title="Importar Programação (PDF / TXT)"
      description="Leia a Planilla de Programación (Argentina / Uruguai) e aloque as frotas automaticamente no quadro"
    />
  );

  if (loading || !state) return header;

  if (!isEditor) {
    return (
      <div className="space-y-5">
        {header}
        <Card className="mx-auto max-w-lg">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-500">
              <Lock className="h-5 w-5" />
            </div>
            <h3 className="text-base font-semibold text-slate-800">Área restrita</h3>
            <p className="max-w-sm text-sm text-slate-500">A importação de programações altera o quadro de frotas e exige login de administrador ou operador.</p>
            <Button onClick={openLogin}>
              <LogIn className="h-4 w-4" /> Entrar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const vehiclesSorted = [...state.vehicles].sort((a, b) => a.frota.localeCompare(b.frota, 'pt-BR', { numeric: true }));

  return (
    <div className="space-y-5">
      {header}

      {step === 'idle' && (
        <Card>
          <CardContent>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                handleFile(e.dataTransfer.files?.[0] ?? null);
              }}
              onClick={() => inputRef.current?.click()}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-14 text-center transition',
                dragOver ? 'border-brand bg-brand-50' : 'border-slate-300 bg-slate-50/60 hover:border-brand/60 hover:bg-brand-50/40',
              )}
            >
              <div className="grid h-14 w-14 place-items-center rounded-full bg-white shadow-sm ring-1 ring-slate-200">
                <Upload className="h-6 w-6 text-brand" />
              </div>
              <div>
                <p className="text-base font-semibold text-slate-800">Arraste o arquivo PDF ou TXT da programação aqui</p>
                <p className="text-sm text-slate-500">ou clique para selecionar · Planilla de Programación (até 15 MB)</p>
              </div>
              <input ref={inputRef} type="file" accept=".pdf,.txt,application/pdf,text/plain" className="hidden" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="mt-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <p className="flex items-start gap-2 text-xs text-slate-500">
                <Sparkles className="mt-px h-3.5 w-3.5 shrink-0 text-brand" />
                Extrai Programação (Nº antes da barra), CRT (final do CONOCIMIENTO), placas CAMION/SEMI-REMOLQUE, Cliente e Destino. Arquivos TXT e PDF com texto são lidos diretamente; digitalizados, pela IA.
              </p>
              <Button variant="outline" size="sm" onClick={() => handleFile(null)}>
                <FileText className="h-3.5 w-3.5" /> Testar com exemplo
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'processing' && (
        <Card className="mx-auto max-w-xl">
          <CardContent className="py-8">
            <div className="mb-6 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-50">
                <Sparkles className="h-5 w-5 animate-pulse text-brand" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-800">Lendo a planilla…</p>
                <p className="truncate text-xs text-slate-500">{fileName}</p>
              </div>
            </div>
            <ol className="space-y-3">
              {STEPS.map((s, i) => (
                <li key={s} className="flex items-center gap-3 text-sm">
                  {i < progress ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : i === progress ? (
                    <Loader2 className="h-4 w-4 animate-spin text-brand" />
                  ) : (
                    <span className="h-4 w-4 rounded-full border-2 border-slate-200" />
                  )}
                  <span className={cn(i <= progress ? 'text-slate-800' : 'text-slate-400')}>{s}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {step === 'review' && result && (
        <>
          <Card>
            <CardHeader className="flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2">
                  Pré-visualização da extração
                  <Badge variant={SOURCE_LABEL[result.source].variant}>{SOURCE_LABEL[result.source].text}</Badge>
                </CardTitle>
                <CardDescription>
                  {result.documento} {result.programacao && <>· Programação {result.programacao}</>} · {rows.length} linha(s) · {rows.filter((r) => r.vehicleId).length} frota(s) encontrada(s) no cadastro
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500">Tipo:</span>
                <div className="inline-flex rounded-md border border-slate-300 p-0.5">
                  {(['exportacao', 'importacao'] as Tipo[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => changeTipo(t)}
                      className={cn('rounded px-3 py-1 text-xs font-semibold', tipo === t ? 'bg-navy text-white' : 'text-slate-600 hover:bg-slate-100')}
                    >
                      {t === 'exportacao' ? 'Exportação' : 'Importação'}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-10 px-4 py-2.5" />
                    <th className="px-3 py-2.5">Camion / Semi-remolque</th>
                    <th className="px-3 py-2.5">Frota (cadastro)</th>
                    <th className="px-3 py-2.5">Programação</th>
                    <th className="px-3 py-2.5">CRT (Conocimiento)</th>
                    <th className="px-3 py-2.5">Cliente / Destino</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => {
                    const v = state.vehicles.find((x) => x.id === r.vehicleId);
                    const current = v ? locate(state, v.id) : null;
                    return (
                      <tr key={r.key} className={cn(!r.include && 'bg-slate-50/70 opacity-60')}>
                        <td className="px-4 py-2.5">
                          <input type="checkbox" className="h-4 w-4 accent-[#0B2545]" checked={r.include} onChange={(e) => update(r.key, { include: e.target.checked })} />
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-mono text-[13px] font-semibold text-slate-800">{formatPlate(r.placaCavalo) || '—'}</div>
                          <div className="font-mono text-[11px] text-slate-500">{formatPlate(r.placaCarreta) || '—'}</div>
                          {r.motorista && <div className="text-[11px] text-slate-400">{r.motorista}</div>}
                        </td>
                        <td className="px-3 py-2.5">
                          <Select
                            className={cn('h-8 w-48 text-xs', !r.vehicleId && 'border-red-300 bg-red-50')}
                            value={r.vehicleId}
                            onChange={(e) => update(r.key, { vehicleId: e.target.value, matchedBy: null, include: !!e.target.value })}
                          >
                            <option value="">Não encontrada</option>
                            {vehiclesSorted.map((x) => (
                              <option key={x.id} value={x.id}>
                                Frota {x.frota} · {formatPlate(x.placaCavalo)}
                              </option>
                            ))}
                          </Select>
                          <div className="mt-1 text-[10.5px]">
                            {r.matchedBy === 'cavalo' && <span className="text-emerald-700">✓ pela placa do CAMION</span>}
                            {r.matchedBy === 'carreta' && <span className="text-emerald-700">✓ pela placa do SEMI-REMOLQUE</span>}
                            {!r.vehicleId && <span className="text-red-600">Placas não cadastradas — não será vinculada</span>}
                            {current?.group && <div className="text-amber-700">Hoje em: {current.column?.title} · {groupTitle(current.group)}</div>}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <Input className="h-8 w-20 text-xs" value={r.programacao} onChange={(e) => update(r.key, { programacao: e.target.value })} />
                        </td>
                        <td className="px-3 py-2.5">
                          <Input className="h-8 w-24 text-xs font-semibold" value={r.crt} onChange={(e) => update(r.key, { crt: e.target.value })} />
                          <div className="mt-1 max-w-[140px] truncate font-mono text-[10.5px] text-slate-400" title={r.crtOriginal}>
                            CRT: {r.crtOriginal || '—'}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <Input className="h-8 w-56 text-xs font-semibold" value={r.clienteDestino} onChange={(e) => update(r.key, { clienteDestino: e.target.value })} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Resultado no quadro</CardTitle>
                <CardDescription>Frotas com mesma Programação + CRT são agrupadas no mesmo bloco</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {blocks.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-slate-500">
                  <Info className="h-4 w-4" /> Selecione ao menos uma linha com frota definida.
                </p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {blocks.map((b) => (
                    <div key={`${b.columnId}${b.programacao}${b.crt}`} className="w-64 overflow-hidden rounded-lg border border-slate-200 shadow-sm">
                      <div className={cn('px-3 py-1.5 text-xs font-bold text-white', tipo === 'exportacao' ? 'bg-navy' : 'bg-emerald-700')}>
                        {state.columns.find((c) => c.id === b.columnId)?.title || 'Exportação'} · {groupTitle({ programacao: b.programacao, crt: b.crt })}
                      </div>
                      <div className="flex flex-wrap gap-1.5 p-2.5">
                        {b.frotas.map((id) => (
                          <FrotaBadge key={id} numero={state.vehicles.find((v) => v.id === id)?.frota ?? ''} macro={state.vehicles.find((v) => v.id === id)?.macro} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {rows.some((r) => r.include && !r.vehicleId) && (
                <p className="flex items-center gap-2 text-xs text-amber-700">
                  <TriangleAlert className="h-3.5 w-3.5" /> Linhas marcadas sem frota serão ignoradas.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
                <span className="text-xs font-semibold text-slate-600">Macro das frotas alocadas:</span>
                {MACRO_ORDER.map((m) => (
                  <button
                    key={m}
                    onClick={() => setMacro(m)}
                    className={cn('rounded transition', macro === m ? 'ring-2 ring-navy ring-offset-1' : 'opacity-50 hover:opacity-100')}
                    title={MACROS[m].label}
                  >
                    <MacroLabel macro={m} className="px-2 py-0.5 text-[11px]" />
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                <Button variant="secondary" onClick={reset}>
                  <RotateCcw className="h-4 w-4" /> Cancelar
                </Button>
                <Button onClick={confirm} disabled={!ready.length || saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Confirmar e alocar {ready.length} frota(s)
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {step === 'done' && summary && (
        <Card className="mx-auto max-w-lg">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-800">Programação importada</h3>
            <p className="text-sm text-slate-500">
              {summary.frotas} frota(s) alocadas em {summary.blocos} bloco(s) de Programação/CRT.
            </p>
            <div className="flex gap-2 pt-2">
              <Button variant="secondary" onClick={reset}>
                Importar outro arquivo
              </Button>
              <Link href="/quadro" className="inline-flex h-9 items-center gap-2 rounded-md bg-navy px-4 text-sm font-medium text-white hover:bg-navy-600">
                Ver no quadro <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
