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
    
    // Aceita tanto arquivos PDF quanto TXT
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
    setTipo(data.tipo === 'importacao' ? 'importacao' : 'exportacao');
    setRows(
      data.rows.map((r, i) => ({
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
        destino: String(r.destino ?? ''),
        columnId: r.columnId ?? '',
        cliente: String(r.cliente ?? ''),
      })),
    );
  }

  function changeTipo(t: Tipo) {
    if (!state) return;
    setTipo(t);
    setRows((rs) => rs.map((r) => ({ ...r, columnId: destinoToColumnId(r.destino, state.columns, t) })));
  }

  const update = (key: string, patch: Partial<ReviewRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const ready = rows.filter((r) => r.include && r.vehicleId && r.columnId);
  const blocks = useMemo(() => {
    const map = new Map<string, { columnId: string; programacao: string; crt: string; cliente: string; frotas: string[] }>();
    for (const r of ready) {
      const k = `${r.programacao}|${r.crt}`;
      const b = map.get(k) ?? { columnId: r.columnId, programacao: r.programacao, crt: r.crt, cliente: r.cliente, frotas: [] };
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
          allocations: ready.map((x) => ({ vehicleId: x.vehicleId, columnId: x.columnId, programacao: x.programacao, crt: x.crt, cliente: x.cliente })),
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
              <LogIn className="h-4
