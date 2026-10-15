'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, FileText, FileUp, Info, Loader2, Lock, LogIn, RotateCcw, Sparkles, TriangleAlert, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/components/providers/auth-provider';
import { useBoard } from '@/components/providers/board-provider';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, PageHeader, Select } from '@/components/ui';
import { applyAllocations, findVehicleByPlate, groupTitle, locate, type Allocation } from '@/lib/board-ops';
import { SEM_PROGRAMACAO } from '@/lib/mock-data';
import type { BoardState, Column, ExtractionResult } from '@/lib/types';
import { cn, crtLast5, formatPlate, normalizeText } from '@/lib/utils';

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
}

const STEPS = ['Lendo o documento PDF', 'Identificando placas (Camión / Acoplado)', 'Extraindo Programação e CRT', 'Cruzando placas com o cadastro de frotas'];

/** Associa o texto de destino do PDF a uma coluna do quadro */
function matchColumn(destino: string, tipo: Tipo, pais: string | null | undefined, columns: Column[]) {
  const d = normalizeText(destino);
  if (tipo === 'importacao') {
    const uy = /uruguai|uruguay|salto|treinta|montevid|rivera|paysandu/.test(d) || pais === 'UY';
    const target = columns.find((c) => c.section === 'importacao' && c.country === (uy ? 'UY' : 'AR'));
    return target?.id ?? columns.find((c) => c.section === 'importacao')?.id ?? '';
  }
  const exp = columns.filter((c) => c.section === 'exportacao');
  const hit = exp.find((c) => {
    const t = normalizeText(c.title).replace(/\b(cl|ar|uy)\b/g, '').trim();
    return d.includes(t) || t.includes(d.split(/[,-]/)[0].trim());
  });
  return hit?.id ?? '';
}

export default function ImportarPdfPage() {
  const { isEditor, openLogin, loading } = useAuth();
  const { state, mutate } = useBoard();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('idle');
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [tipo, setTipo] = useState<Tipo>('exportacao');
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [summary, setSummary] = useState<{ frotas: number; blocos: number } | null>(null);

  async function handleFile(file: File | null) {
    if (!state) return;
    if (file && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Envie um arquivo PDF.');
      return;
    }
    setFileName(file?.name ?? 'Exemplo — Planilla de Programación Argentina');
    setStep('processing');
    setProgress(0);
    const timer = setInterval(() => setProgress((p) => Math.min(p + 1, STEPS.length - 1)), 900);

    try {
      const fd = new FormData();
      if (file) fd.append('file', file);
      else fd.append('demo', '1');
      const [res] = await Promise.all([fetch('/api/extract-pdf', { method: 'POST', body: fd }), new Promise((r) => setTimeout(r, 3200))]);
      const data = (await res.json()) as ExtractionResult & { error?: string };
      if (!res.ok) throw new Error(data.error || 'Falha ao processar o PDF');
      setProgress(STEPS.length);
      buildReview(data, state);
      setStep('review');
      if (data.warning) toast.warning(data.warning);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao processar o PDF');
      setStep('idle');
    } finally {
      clearInterval(timer);
    }
  }

  function buildReview(data: ExtractionResult, s: BoardState) {
    const t: Tipo = data.tipo === 'importacao' ? 'importacao' : 'exportacao';
    setResult(data);
    setTipo(t);
    setRows(
      data.rows.map((r, i) => {
        const byCavalo = findVehicleByPlate(s, r.placaCavalo);
        const byCarreta = byCavalo ? undefined : findVehicleByPlate(s, r.placaCarreta);
        const v = byCavalo ?? byCarreta;
        const crtOriginal = String(r.crt ?? '');
        const destino = String(r.destino ?? '');
        return {
          key: `r${i}`,
          include: !!v,
          placaCavalo: r.placaCavalo,
          placaCarreta: String(r.placaCarreta ?? ''),
          motorista: String(r.motorista ?? ''),
          vehicleId: v?.id ?? '',
          matchedBy: byCavalo ? 'cavalo' : byCarreta ? 'carreta' : null,
          crtOriginal,
          crt: t === 'exportacao' ? crtLast5(crtOriginal) : crtOriginal.replace(/\D/g, '').slice(-5),
          programacao: String(r.programacao ?? data.programacao ?? '').replace(/\D/g, ''),
          destino,
          columnId: matchColumn(destino, t, data.pais, s.columns),
          cliente: String(r.cliente ?? ''),
        };
      }),
    );
  }

  function changeTipo(t: Tipo) {
    if (!state || !result) return;
    setTipo(t);
    setRows((rs) => rs.map((r) => ({ ...r, columnId: matchColumn(r.destino, t, result.pais, state.columns) })));
  }

  const update = (key: string, patch: Partial<ReviewRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const ready = rows.filter((r) => r.include && r.vehicleId && r.columnId);
  const blocks = useMemo(() => {
    const map = new Map<string, { columnId: string; programacao: string; crt: string; cliente: string; frotas: string[] }>();
    for (const r of ready) {
      const k = `${r.columnId}|${r.programacao}|${r.crt}`;
      const b = map.get(k) ?? { columnId: r.columnId, programacao: r.programacao, crt: r.crt, cliente: r.cliente, frotas: [] };
      b.frotas.push(r.vehicleId);
      map.set(k, b);
    }
    return Array.from(map.values());
  }, [ready]);

  function confirm() {
    const allocs: Allocation[] = ready.map((r) => ({
      vehicleId: r.vehicleId,
      columnId: r.columnId,
      programacao: r.programacao || undefined,
      crt: r.crt || undefined,
      cliente: r.cliente || undefined,
    }));
    mutate((s) => applyAllocations(s, allocs));
    setSummary({ frotas: allocs.length, blocos: blocks.length });
    setStep('done');
    toast.success(`${allocs.length} frota(s) alocadas no quadro.`);
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
      title="Importar PDF de Programação"
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
  const targetColumns = state.columns.filter((c) => c.section === tipo);

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
                <p className="text-base font-semibold text-slate-800">Arraste o PDF da programação aqui</p>
                <p className="text-sm text-slate-500">ou clique para selecionar · Planilla de Programación (até 15 MB)</p>
              </div>
              <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="mt-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <p className="flex items-start gap-2 text-xs text-slate-500">
                <Sparkles className="mt-px h-3.5 w-3.5 shrink-0 text-brand" />
                A IA extrai Placas (Camión/Acoplado), CRT (somente os 5 últimos dígitos), Programação, Destino e Cliente. Nada é alterado antes da sua confirmação.
              </p>
              <Button variant="outline" size="sm" onClick={() => handleFile(null)}>
                <FileText className="h-3.5 w-3.5" /> Testar com PDF de exemplo
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
                <p className="font-semibold text-slate-800">Processando com IA…</p>
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
                  <Badge variant={result.source === 'claude' ? 'success' : 'warning'}>{result.source === 'claude' ? 'Lido por IA (Claude)' : 'Simulação'}</Badge>
                </CardTitle>
                <CardDescription>
                  {result.documento} {result.programacao && <>· Programação {result.programacao}</>} · {rows.length} linha(s)
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
                    <th className="px-3 py-2.5">Camión / Acoplado (PDF)</th>
                    <th className="px-3 py-2.5">Frota (cadastro)</th>
                    <th className="px-3 py-2.5">Programação</th>
                    <th className="px-3 py-2.5">CRT</th>
                    <th className="px-3 py-2.5">Destino no quadro</th>
                    <th className="px-3 py-2.5">Cliente</th>
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
                          <div className="font-mono text-[13px] font-semibold text-slate-800">{r.placaCavalo}</div>
                          <div className="font-mono text-[11px] text-slate-500">{r.placaCarreta || '—'}</div>
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
                            {r.matchedBy === 'cavalo' && <span className="text-emerald-700">✓ pela placa do cavalo</span>}
                            {r.matchedBy === 'carreta' && <span className="text-emerald-700">✓ pela placa da carreta</span>}
                            {!r.vehicleId && <span className="text-red-600">Placa não cadastrada</span>}
                            {current?.group && <div className="text-amber-700">Hoje em: {current.column?.title} · {groupTitle(current.group)}</div>}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <Input className="h-8 w-20 text-xs" value={r.programacao} onChange={(e) => update(r.key, { programacao: e.target.value })} />
                        </td>
                        <td className="px-3 py-2.5">
                          <Input className="h-8 w-24 text-xs font-semibold" value={r.crt} onChange={(e) => update(r.key, { crt: e.target.value })} />
                          <div className="mt-1 max-w-[140px] truncate font-mono text-[10.5px] text-slate-400" title={r.crtOriginal}>
                            PDF: {r.crtOriginal || '—'}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <Select className={cn('h-8 w-40 text-xs', !r.columnId && 'border-amber-300 bg-amber-50')} value={r.columnId} onChange={(e) => update(r.key, { columnId: e.target.value })}>
                            <option value="">Selecione…</option>
                            {targetColumns
                              .filter((c) => c.id !== SEM_PROGRAMACAO)
                              .map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.title}
                                </option>
                              ))}
                          </Select>
                          <div className="mt-1 text-[10.5px] text-slate-400">PDF: {r.destino || '—'}</div>
                        </td>
                        <td className="px-3 py-2.5">
                          <Input className="h-8 w-44 text-xs" value={r.cliente} onChange={(e) => update(r.key, { cliente: e.target.value })} />
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
                  <Info className="h-4 w-4" /> Selecione ao menos uma linha com frota e destino definidos.
                </p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {blocks.map((b) => (
                    <div key={`${b.columnId}${b.programacao}${b.crt}`} className="w-64 overflow-hidden rounded-lg border border-slate-200 shadow-sm">
                      <div className={cn('px-3 py-1.5 text-xs font-bold text-white', tipo === 'exportacao' ? 'bg-navy' : 'bg-emerald-700')}>
                        {state.columns.find((c) => c.id === b.columnId)?.title} · {groupTitle({ programacao: b.programacao, crt: b.crt })}
                      </div>
                      <div className="flex flex-wrap gap-1.5 p-2.5">
                        {b.frotas.map((id) => (
                          <Badge key={id} variant="outline" className="text-xs">
                            {state.vehicles.find((v) => v.id === id)?.frota}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {rows.some((r) => r.include && (!r.vehicleId || !r.columnId)) && (
                <p className="flex items-center gap-2 text-xs text-amber-700">
                  <TriangleAlert className="h-3.5 w-3.5" /> Linhas marcadas sem frota ou sem destino serão ignoradas.
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                <Button variant="secondary" onClick={reset}>
                  <RotateCcw className="h-4 w-4" /> Cancelar
                </Button>
                <Button onClick={confirm} disabled={!ready.length}>
                  <CheckCircle2 className="h-4 w-4" /> Confirmar e alocar {ready.length} frota(s)
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
                Importar outro PDF
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
