'use client';

import { useState } from 'react';
import { AlertTriangle, Clock, MapPin, Trash2, Truck, User } from 'lucide-react';
import type { Column, Country, Macro, Section } from '@/lib/types';
import { MACRO_ORDER, MACROS, expectedMacros, macroAlert } from '@/lib/macro';
import { SEM_PROGRAMACAO } from '@/lib/mock-data';
import { addColumn, addGroup, deleteGroup, groupTitle, locate, moveFrota, updateGroup, updateVehicle } from '@/lib/board-ops';
import { cn, COUNTRY_LABEL, crtLast5, formatDateTime, formatPlate, timeAgo } from '@/lib/utils';
import { useAuth } from '@/components/providers/auth-provider';
import { useBoard } from '@/components/providers/board-provider';
import { Badge, Button, Dialog, Input, Label, Select } from '@/components/ui';

// ---------------------------------------------------------------------------
// Detalhes da frota (público) + atualização de macro / mover (editor)
// ---------------------------------------------------------------------------
export function FrotaDialog({ vehicleId, onClose }: { vehicleId: string | null; onClose: () => void }) {
  const { state, mutate } = useBoard();
  const { isEditor } = useAuth();
  const v = state?.vehicles.find((x) => x.id === vehicleId);
  if (!state || !v) return null;

  const { group, column } = locate(state, v.id);
  const alert = macroAlert(v, expectedMacros(column, group));

  const setMacro = (m: Macro) => mutate((s) => updateVehicle(s, v.id, { macro: m, macroUpdatedAt: new Date().toISOString() }));

  return (
    <Dialog
      open
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <span className="rounded-md bg-navy px-2 py-0.5 text-sm text-white">Frota {v.frota}</span>
          <span className="text-sm font-medium text-slate-500">{v.motorista}</span>
        </span>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <Info icon={<Truck className="h-3.5 w-3.5" />} label="Placa cavalo" value={formatPlate(v.placaCavalo)} />
          <Info icon={<Truck className="h-3.5 w-3.5" />} label="Placa carreta" value={formatPlate(v.placaCarreta)} />
          <Info icon={<User className="h-3.5 w-3.5" />} label="Motorista" value={v.motorista} />
          <Info
            icon={<MapPin className="h-3.5 w-3.5" />}
            label="Posição no quadro"
            value={group ? `${column?.title} · ${groupTitle(group)}` : 'Sem Programação'}
          />
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Macro do rastreador</span>
            <span className="flex items-center gap-1 text-xs text-slate-500" title={formatDateTime(v.macroUpdatedAt)}>
              <Clock className="h-3 w-3" /> {timeAgo(v.macroUpdatedAt)}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {MACRO_ORDER.map((m) => (
              <button
                key={m}
                disabled={!isEditor}
                onClick={() => setMacro(m)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition',
                  v.macro === m ? MACROS[m].badge : 'bg-white text-slate-400 ring-slate-200',
                  isEditor && v.macro !== m && 'hover:text-slate-700 hover:ring-slate-300',
                  !isEditor && 'cursor-default',
                )}
              >
                <span className={cn('h-2 w-2 rounded-full', MACROS[m].dot)} />
                {MACROS[m].label}
              </button>
            ))}
          </div>
          {alert && (
            <p className={cn('mt-2.5 flex items-start gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium', alert.type === 'mismatch' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800')}>
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> {alert.message}
            </p>
          )}
        </div>

        {isEditor && (
          <div>
            <Label>Mover para</Label>
            <Select value={group?.id ?? ''} onChange={(e) => mutate((s) => moveFrota(s, v.id, e.target.value || null))}>
              <option value="">Sem Programação</option>
              {state.columns
                .filter((c) => c.id !== SEM_PROGRAMACAO)
                .map((c) => {
                  const gs = state.groups.filter((g) => g.columnId === c.id);
                  if (!gs.length) return null;
                  return (
                    <optgroup key={c.id} label={c.title}>
                      {gs.map((g) => (
                        <option key={g.id} value={g.id}>
                          {groupTitle(g)}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
            </Select>
            <p className="mt-1 text-[11px] text-slate-400">Dica: no computador você também pode arrastar a frota direto no quadro.</p>
          </div>
        )}
      </div>
    </Dialog>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
        {icon} {label}
      </div>
      <div className="mt-0.5 font-semibold text-slate-800">{value || '—'}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Criar / editar bloco de Programação + CRT
// ---------------------------------------------------------------------------
export function GroupDialog({
  groupId,
  columnId,
  seedVehicleId,
  onClose,
}: {
  groupId: string | null;
  columnId: string;
  seedVehicleId?: string;
  onClose: () => void;
}) {
  const { state, mutate } = useBoard();
  const group = state?.groups.find((g) => g.id === groupId);
  // inicializado uma única vez (o polling do quadro não apaga o que está sendo digitado)
  const [form, setForm] = useState(() => ({
    columnId: group?.columnId ?? columnId,
    label: group?.label ?? '',
    programacao: group?.programacao ?? '',
    crt: group?.crt ?? '',
    cliente: group?.cliente ?? '',
  }));
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!state) return null;
  const column = state.columns.find((c) => c.id === form.columnId);
  const isExport = column?.section === 'exportacao';
  const seed = state.vehicles.find((v) => v.id === seedVehicleId);
  const crtDigits = form.crt.replace(/\D/g, '');

  function save() {
    const data = {
      columnId: form.columnId,
      label: form.label.trim() || undefined,
      programacao: form.programacao.trim() || undefined,
      crt: (isExport ? crtLast5(form.crt) : form.crt.trim()) || undefined,
      cliente: form.cliente.trim() || undefined,
    };
    if (group) {
      mutate((s) => updateGroup(s, group.id, data));
    } else {
      mutate((s) => {
        const [next, id] = addGroup(s, { ...data, frotaIds: [] });
        return seedVehicleId ? moveFrota(next, seedVehicleId, id) : next;
      });
    }
    onClose();
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog
      open
      onClose={onClose}
      title={group ? 'Editar bloco' : column?.section === 'status' ? 'Novo grupo' : 'Nova Programação / CRT'}
      description={seed ? `A frota ${seed.frota} será incluída neste bloco.` : 'Agrupe várias frotas sob a mesma programação e CRT.'}
      footer={
        <>
          {group &&
            (confirmDelete ? (
              <Button variant="danger" size="sm" className="mr-auto" onClick={() => (mutate((s) => deleteGroup(s, group.id)), onClose())}>
                Confirmar exclusão
              </Button>
            ) : (
              <Button variant="danger-ghost" size="sm" className="mr-auto" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-3.5 w-3.5" /> Excluir bloco
              </Button>
            ))}
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save}>Salvar</Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label>Coluna / destino</Label>
          <Select value={form.columnId} onChange={set('columnId')}>
            {(['exportacao', 'status', 'importacao'] as Section[]).map((sec) => (
              <optgroup key={sec} label={SECTION_LABEL[sec]}>
                {state.columns
                  .filter((c) => c.section === sec && c.id !== SEM_PROGRAMACAO)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
              </optgroup>
            ))}
          </Select>
        </div>
        <div>
          <Label>Programação</Label>
          <Input placeholder="Ex: 384" value={form.programacao} onChange={set('programacao')} />
        </div>
        <div>
          <Label>CRT / Conhecimento</Label>
          <Input placeholder={isExport ? 'Ex: 57305' : 'Ex: 497'} value={form.crt} onChange={set('crt')} />
          {isExport && crtDigits.length > 5 && (
            <p className="mt-1 text-[11px] text-brand">
              Será salvo como <b>{crtLast5(form.crt)}</b> (5 últimos dígitos)
            </p>
          )}
        </div>
        <div>
          <Label>Rótulo (opcional)</Label>
          <Input placeholder="Ex: Salto, Carregados…" value={form.label} onChange={set('label')} />
        </div>
        <div>
          <Label>Cliente (opcional)</Label>
          <Input placeholder="Ex: Sulpapéis" value={form.cliente} onChange={set('cliente')} />
        </div>
      </div>
      {group && group.frotaIds.length > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          Frotas neste bloco:{' '}
          {group.frotaIds.map((id) => (
            <Badge key={id} variant="brand" className="mr-1">
              {state.vehicles.find((v) => v.id === id)?.frota}
            </Badge>
          ))}
          <br />
          Ao excluir o bloco, as frotas voltam para “Sem Programação”.
        </p>
      )}
    </Dialog>
  );
}

export const SECTION_LABEL: Record<Section, string> = {
  exportacao: 'Exportação',
  status: 'Status operacionais',
  importacao: 'Importação',
};

// ---------------------------------------------------------------------------
// Nova coluna (destino de exportação / origem de importação / status)
// ---------------------------------------------------------------------------
export function ColumnDialog({ section, onClose }: { section: Section; onClose: () => void }) {
  const { mutate } = useBoard();
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [country, setCountry] = useState<Country | ''>(section === 'status' ? '' : 'AR');

  function save() {
    if (!title.trim()) return;
    const data: Omit<Column, 'id'> = { title: title.trim(), section, subtitle: subtitle.trim() || undefined, country: country || undefined };
    mutate((s) => addColumn(s, data));
    onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={section === 'exportacao' ? 'Novo destino de exportação' : section === 'importacao' ? 'Nova origem de importação' : 'Novo status'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={!title.trim()}>
            Adicionar coluna
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <Label>Nome</Label>
          <Input autoFocus placeholder={section === 'exportacao' ? 'Ex: Mendoza' : 'Ex: Paraguai'} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label>Subtítulo (opcional)</Label>
          <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
        </div>
        <div>
          <Label>País</Label>
          <Select value={country} onChange={(e) => setCountry(e.target.value as Country | '')}>
            <option value="">—</option>
            {Object.entries(COUNTRY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </Dialog>
  );
}
