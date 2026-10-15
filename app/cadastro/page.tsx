'use client';

import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, FileSpreadsheet, Lock, Search, Trash2, Truck, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/components/providers/auth-provider';
import { useBoard } from '@/components/providers/board-provider';
import { Badge, Button, Card, Dialog, Input, PageHeader, Skeleton } from '@/components/ui';
import { FrotaBadge, MacroLabel } from '@/components/board/frota-badge';
import { deleteVehicles, locationLabel, upsertVehicles } from '@/lib/board-ops';
import type { Vehicle, VehicleInput } from '@/lib/types';
import { cn, formatPlate, normalizePlate, normalizeText } from '@/lib/utils';

// ---------- Leitura da planilha (CSV / XLSX) ----------
function mapRow(row: Record<string, unknown>): VehicleInput | null {
  let frota = '';
  let placaCavalo = '';
  let placaCarreta = '';
  let motorista = '';
  for (const [k, v] of Object.entries(row)) {
    const key = normalizeText(k);
    const val = String(v ?? '').trim();
    if (!val) continue;
    if (!frota && /frota|numero|^n[ºo°]?\.?$/.test(key)) frota = val.replace(/\.0+$/, '');
    else if (!placaCarreta && /carreta|semi|reboque|acoplado/.test(key)) placaCarreta = val;
    else if (!placaCavalo && /cavalo|trator|tractor|camion|placa/.test(key)) placaCavalo = val;
    else if (!motorista && /motorista|condutor|chofer/.test(key)) motorista = val;
  }
  if (!frota) return null;
  return { frota, placaCavalo: formatPlate(placaCavalo), placaCarreta: formatPlate(placaCarreta), motorista };
}

async function readSheet(file: File): Promise<VehicleInput[]> {
  let wb: XLSX.WorkBook;
  if (file.name.toLowerCase().endsWith('.csv')) {
    const text = await file.text();
    const first = text.split(/\r?\n/)[0] ?? '';
    const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : ',';
    wb = XLSX.read(text, { type: 'string', FS: sep });
  } else {
    wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  }
  const ws = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false });
  const seen = new Set<string>();
  return json
    .map(mapRow)
    .filter((r): r is VehicleInput => !!r && !seen.has(r.frota) && !!seen.add(r.frota));
}

function downloadTemplate() {
  const csv = 'Frota;Placa Cavalo;Placa Carreta;Motorista\n161;OAD-5041;IWK-2768;João da Silva\n177;IXR-7549;JAQ-0615;Carlos Pereira\n';
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'modelo-cadastro-frotas.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportXlsx(vehicles: Vehicle[]) {
  const ws = XLSX.utils.json_to_sheet(
    vehicles.map((v) => ({ Frota: v.frota, 'Placa Cavalo': v.placaCavalo, 'Placa Carreta': v.placaCarreta, Motorista: v.motorista })),
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Frotas');
  XLSX.writeFile(wb, `cadastro-frotas-polivias-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ---------- Página ----------
export default function CadastroPage() {
  const { state, mutate } = useBoard();
  const { isEditor, openLogin } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [preview, setPreview] = useState<{ name: string; rows: VehicleInput[] } | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!state) return <Skeleton className="h-96" />;

  async function onFile(file?: File | null) {
    if (!file) return;
    try {
      const rows = await readSheet(file);
      if (!rows.length) throw new Error('Nenhuma linha válida. Verifique se existe a coluna "Frota".');
      setPreview({ name: file.name, rows });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível ler a planilha');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function confirmImport() {
    if (!preview || !state) return;
    const r = upsertVehicles(state, preview.rows, mode);
    mutate(() => r.state);
    setSelectedIds([]);
    toast.success(`Cadastro atualizado: ${r.added} nova(s), ${r.updated} atualizada(s)${r.removed ? `, ${r.removed} removida(s)` : ''}.`);
    setPreview(null);
  }

  const nq = normalizeText(q);
  const np = normalizePlate(q);
  const list = state.vehicles
    .filter(
      (v) =>
        !nq ||
        v.frota.startsWith(nq) ||
        normalizeText(v.motorista).includes(nq) ||
        (np.length >= 2 && (normalizePlate(v.placaCavalo).includes(np) || normalizePlate(v.placaCarreta).includes(np))),
    )
    .sort((a, b) => a.frota.localeCompare(b.frota, 'pt-BR', { numeric: true }));

  // Seleção considera apenas frotas que ainda existem (o cadastro pode mudar por outro operador)
  const existing = new Set(state.vehicles.map((v) => v.id));
  const selected = selectedIds.filter((id) => existing.has(id));
  const visibleIds = list.map((v) => v.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));
  const someVisibleSelected = visibleIds.some((id) => selected.includes(id));

  const handleSelectAll = (checked: boolean) =>
    setSelectedIds((prev) => (checked ? Array.from(new Set([...prev, ...visibleIds])) : prev.filter((id) => !visibleIds.includes(id))));

  const handleSelectOne = (id: string, checked: boolean) =>
    setSelectedIds((prev) => (checked ? [...prev, id] : prev.filter((item) => item !== id)));

  function handleDeleteSelected() {
    const n = selected.length;
    mutate((s) => deleteVehicles(s, selected));
    setSelectedIds([]);
    setConfirmDelete(false);
    toast.success(`${n} frota(s) excluída(s) do cadastro e do quadro.`);
  }

  const selectedVehicles = state.vehicles.filter((v) => selected.includes(v.id));

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<Truck className="h-5 w-5" />}
        title="Cadastro de Frotas"
        description={`${state.vehicles.length} veículos · atualização via importação de planilha`}
        actions={
          <>
            {isEditor && selected.length > 0 && (
              <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" /> Excluir ({selected.length})
              </Button>
            )}
            <Button variant="secondary" onClick={downloadTemplate}>
              <Download className="h-4 w-4" /> Modelo CSV
            </Button>
            <Button variant="secondary" onClick={() => exportXlsx(state.vehicles)}>
              <FileSpreadsheet className="h-4 w-4" /> Exportar Excel
            </Button>
            {isEditor ? (
              <>
                <Button onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4" /> Importar planilha
                </Button>
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              </>
            ) : (
              <Button onClick={openLogin}>
                <Lock className="h-4 w-4" /> Entrar para importar
              </Button>
            )}
          </>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input className="pl-8" placeholder="Filtrar por frota, placa ou motorista" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <p className="text-xs text-slate-500">
            {isEditor
              ? selected.length
                ? `${selected.length} selecionada(s). Os dados das frotas são alterados somente pela importação de planilha.`
                : 'Os dados das frotas são alterados somente pela importação de planilha. Marque as caixas para excluir em massa.'
              : 'Modo leitura — entre para importar planilhas ou excluir frotas.'}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-100 text-xs font-semibold uppercase text-slate-700">
              <tr>
                {isEditor && (
                  <th className="w-10 p-3 text-center">
                    <input
                      type="checkbox"
                      aria-label="Selecionar todas"
                      className="h-4 w-4 cursor-pointer accent-[#0B2545]"
                      checked={allVisibleSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected;
                      }}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                    />
                  </th>
                )}
                <th className="p-3">Frota</th>
                <th className="p-3">Placa Cavalo</th>
                <th className="p-3">Placa Carreta</th>
                <th className="p-3">Motorista</th>
                <th className="p-3">Macro do Rastreador</th>
                <th className="p-3">Posição atual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((v) => {
                const isSel = selected.includes(v.id);
                return (
                  <tr
                    key={v.id}
                    className={cn('transition', isSel ? 'bg-brand-50/70' : 'hover:bg-slate-50', isEditor && 'cursor-pointer')}
                    onClick={() => isEditor && handleSelectOne(v.id, !isSel)}
                  >
                    {isEditor && (
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Selecionar frota ${v.frota}`}
                          className="h-4 w-4 cursor-pointer accent-[#0B2545]"
                          checked={isSel}
                          onChange={(e) => handleSelectOne(v.id, e.target.checked)}
                        />
                      </td>
                    )}
                    <td className="p-3 font-bold text-slate-900">{v.frota}</td>
                    <td className="p-3 font-mono text-[13px] text-slate-700">{v.placaCavalo || '—'}</td>
                    <td className="p-3 font-mono text-[13px] text-slate-700">{v.placaCarreta || '—'}</td>
                    <td className="p-3 text-slate-700">{v.motorista || '—'}</td>
                    <td className="p-3">
                      <MacroLabel macro={v.macro} />
                    </td>
                    <td className="max-w-[260px] truncate p-3 text-xs text-slate-600">{locationLabel(state, v.id)}</td>
                  </tr>
                );
              })}
              {list.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-500">
                    Nenhuma frota encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Confirmação da exclusão em massa */}
      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        size="sm"
        title={`Excluir ${selected.length} frota(s)?`}
        description="Elas saem do cadastro e de todos os blocos do quadro. Para trazê-las de volta, importe a planilha novamente."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleDeleteSelected}>
              <Trash2 className="h-4 w-4" /> Excluir
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {selectedVehicles.map((v) => (
            <FrotaBadge key={v.id} numero={v.frota} macro={v.macro} />
          ))}
        </div>
      </Dialog>

      {/* Pré-visualização da planilha */}
      <Dialog
        open={!!preview}
        onClose={() => setPreview(null)}
        size="lg"
        title="Importar planilha de frotas"
        description={preview ? `${preview.name} · ${preview.rows.length} veículos encontrados` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPreview(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmImport}>Confirmar importação</Button>
          </>
        }
      >
        {preview && (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ['merge', 'Mesclar', 'Atualiza pelo nº da frota e adiciona as novas. Nada é removido.'],
                  ['replace', 'Substituir cadastro', 'O cadastro passa a ser exatamente a planilha. Frotas ausentes saem do quadro.'],
                ] as const
              ).map(([value, title, desc]) => (
                <label
                  key={value}
                  className={cn('cursor-pointer rounded-lg border p-3 transition', mode === value ? 'border-brand bg-brand-50 ring-1 ring-brand' : 'border-slate-200 hover:border-slate-300')}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <input type="radio" name="mode" className="accent-[#0B2545]" checked={mode === value} onChange={() => setMode(value)} />
                    {title}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{desc}</p>
                </label>
              ))}
            </div>
            <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 text-left font-semibold text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Frota</th>
                    <th className="px-3 py-2">Placa cavalo</th>
                    <th className="px-3 py-2">Placa carreta</th>
                    <th className="px-3 py-2">Motorista</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.rows.map((r) => {
                    const exists = state.vehicles.some((v) => v.frota === r.frota);
                    return (
                      <tr key={r.frota}>
                        <td className="px-3 py-1.5 font-bold text-navy">{r.frota}</td>
                        <td className="px-3 py-1.5 font-mono">{r.placaCavalo || '—'}</td>
                        <td className="px-3 py-1.5 font-mono">{r.placaCarreta || '—'}</td>
                        <td className="px-3 py-1.5">{r.motorista || '—'}</td>
                        <td className="px-3 py-1.5">
                          <Badge variant={exists ? 'brand' : 'success'}>{exists ? 'Atualizar' : 'Nova'}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-500">
              Colunas reconhecidas automaticamente: <b>Frota</b>, <b>Placa Cavalo</b>, <b>Placa Carreta</b>, <b>Motorista</b> (CSV com “;” ou “,” e Excel .xlsx).
            </p>
          </div>
        )}
      </Dialog>

    </div>
  );
}
