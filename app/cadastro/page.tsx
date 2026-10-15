'use client';

import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, FileSpreadsheet, Lock, Plus, Search, Trash2, Truck, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/components/providers/auth-provider';
import { useBoard } from '@/components/providers/board-provider';
import { Badge, Button, Card, Dialog, Input, Label, PageHeader, Skeleton } from '@/components/ui';
import { addVehicle, deleteVehicle, locationLabel, updateVehicle, upsertVehicles } from '@/lib/board-ops';
import { MACROS } from '@/lib/macro';
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
  const [newOpen, setNewOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

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

  const commit = (v: Vehicle, field: keyof VehicleInput, value: string) => {
    const val = field.startsWith('placa') ? formatPlate(value) : value.trim();
    if (val === v[field]) return;
    if (field === 'frota' && state.vehicles.some((x) => x.id !== v.id && x.frota === val)) {
      toast.error(`Já existe a frota ${val}.`);
      return;
    }
    mutate((s) => updateVehicle(s, v.id, { [field]: val }));
  };

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<Truck className="h-5 w-5" />}
        title="Cadastro de Frotas"
        description={`${state.vehicles.length} veículos cadastrados · base para o cruzamento de placas na importação de PDFs`}
        actions={
          <>
            <Button variant="secondary" onClick={downloadTemplate}>
              <Download className="h-4 w-4" /> Modelo CSV
            </Button>
            <Button variant="secondary" onClick={() => exportXlsx(state.vehicles)}>
              <FileSpreadsheet className="h-4 w-4" /> Exportar Excel
            </Button>
            {isEditor ? (
              <>
                <Button variant="outline" onClick={() => setNewOpen(true)}>
                  <Plus className="h-4 w-4" /> Nova frota
                </Button>
                <Button onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4" /> Importar planilha
                </Button>
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              </>
            ) : (
              <Button onClick={openLogin}>
                <Lock className="h-4 w-4" /> Entrar para editar
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
            {isEditor ? 'Clique em uma célula para editar — a alteração é salva ao sair do campo.' : 'Modo leitura — entre para editar o cadastro.'}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-24 px-5 py-2.5">Frota</th>
                <th className="w-36 px-3 py-2.5">Placa cavalo</th>
                <th className="w-36 px-3 py-2.5">Placa carreta</th>
                <th className="px-3 py-2.5">Motorista</th>
                <th className="w-32 px-3 py-2.5">Macro</th>
                <th className="px-3 py-2.5">Posição atual</th>
                {isEditor && <th className="w-14 px-3 py-2.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50/60">
                  {(['frota', 'placaCavalo', 'placaCarreta', 'motorista'] as const).map((field, i) => (
                    <td key={field} className={cn(i === 0 ? 'px-5' : 'px-3', 'py-1.5')}>
                      {isEditor ? (
                        <input
                          key={`${v.id}-${v[field]}`}
                          defaultValue={v[field]}
                          onBlur={(e) => commit(v, field, e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                          className={cn(
                            'h-8 w-full rounded-md border border-transparent bg-transparent px-2 hover:border-slate-200 focus:border-brand focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand/20',
                            field === 'frota' && 'font-bold text-navy',
                            field.startsWith('placa') && 'font-mono text-[13px]',
                          )}
                        />
                      ) : (
                        <span className={cn('block px-2 py-1.5', field === 'frota' && 'font-bold text-navy', field.startsWith('placa') && 'font-mono text-[13px]')}>
                          {v[field] || '—'}
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-1.5">
                    <span className={cn('inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset', MACROS[v.macro].badge)}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', MACROS[v.macro].dot)} />
                      {MACROS[v.macro].label}
                    </span>
                  </td>
                  <td className="max-w-[260px] truncate px-3 py-1.5 text-xs text-slate-600">{locationLabel(state, v.id)}</td>
                  {isEditor && (
                    <td className="px-3 py-1.5">
                      {pendingDelete === v.id ? (
                        <button
                          className="rounded bg-red-600 px-2 py-1 text-[11px] font-semibold text-white"
                          onClick={() => {
                            mutate((s) => deleteVehicle(s, v.id));
                            setPendingDelete(null);
                          }}
                          onMouseLeave={() => setPendingDelete(null)}
                        >
                          Excluir
                        </button>
                      ) : (
                        <button className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Excluir frota" onClick={() => setPendingDelete(v.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
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

      <NewVehicleDialog open={newOpen} onClose={() => setNewOpen(false)} existing={state.vehicles} onSave={(input) => mutate((s) => addVehicle(s, input))} />
    </div>
  );
}

function NewVehicleDialog({
  open,
  onClose,
  existing,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  existing: Vehicle[];
  onSave: (v: VehicleInput) => void;
}) {
  const empty = { frota: '', placaCavalo: '', placaCarreta: '', motorista: '' };
  const [form, setForm] = useState<VehicleInput>(empty);
  const duplicate = existing.some((v) => v.frota === form.frota.trim());

  function save() {
    onSave({ frota: form.frota.trim(), placaCavalo: formatPlate(form.placaCavalo), placaCarreta: formatPlate(form.placaCarreta), motorista: form.motorista.trim() });
    toast.success(`Frota ${form.frota} cadastrada.`);
    setForm(empty);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="Nova frota"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={!form.frota.trim() || duplicate}>
            Cadastrar
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        {(
          [
            ['frota', 'Nº da frota', '161'],
            ['placaCavalo', 'Placa cavalo', 'OAD-5041'],
            ['placaCarreta', 'Placa carreta', 'IWK-2768'],
            ['motorista', 'Motorista', 'Nome completo'],
          ] as const
        ).map(([k, label, ph]) => (
          <div key={k}>
            <Label>{label}</Label>
            <Input placeholder={ph} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
          </div>
        ))}
      </div>
      {duplicate && <p className="mt-2 text-xs text-red-600">Já existe uma frota com esse número.</p>}
    </Dialog>
  );
}
