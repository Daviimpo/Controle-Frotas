'use client';

import { useCallback, useMemo, useState, type CSSProperties, type DragEvent } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { Column, Group, Section, Vehicle } from '@/lib/types';
import { addGroup, columnCount, moveFrota, removeColumn, unassignedVehicles, vehicleAlert } from '@/lib/board-ops';
import { ALERT_CELL, MACROS, expectedMacros, macroAlert } from '@/lib/macro';
import { SEM_PROGRAMACAO } from '@/lib/mock-data';
import { buildSheetLayout, type SheetLeaf } from '@/lib/planilha-layout';
import { cn, formatPlate, normalizePlate, normalizeText } from '@/lib/utils';
import { useAuth } from '@/components/providers/auth-provider';
import { useBoard } from '@/components/providers/board-provider';
import { Logo } from '@/components/layout/navbar';
import { Button } from '@/components/ui';
import { BoardUiContext, DRAG_MIME, readDraggedId, useBoardUi, type BoardUi } from './board-ui';
import { ColumnDialog, FrotaDialog, GroupDialog } from './dialogs';

/** Cores da planilha PROGRAMAÇÃO FROTAS */
const HEADER_BG = 'bg-[#004B87]';
const BAND_BG = 'bg-[#2E75B6]';
/** Linhas por coluna antes de a lista continuar na coluna ao lado (colunas duplas) */
const ROWS_PER_COLUMN = 26;
/** Largura mínima de uma coluna da planilha (px) */
const UNIT = 98;

const isBlank = (g: Group) => !g.label && !g.programacao && !g.crt;

export function PlanilhaBoard({ search, onlyAlerts }: { search: string; onlyAlerts: boolean }) {
  const { state } = useBoard();
  const { isEditor } = useAuth();
  const [frotaId, setFrotaId] = useState<string | null>(null);
  const [groupDlg, setGroupDlg] = useState<{ groupId: string | null; columnId: string; seedVehicleId?: string } | null>(null);
  const [columnDlg, setColumnDlg] = useState<Section | null>(null);

  const q = normalizeText(search);
  const qPlate = normalizePlate(search);
  const matches = useCallback(
    (v: Vehicle) =>
      !q ||
      v.frota === search.trim() ||
      (q.length >= 2 &&
        (v.frota.startsWith(q) ||
          normalizeText(v.motorista).includes(q) ||
          (qPlate.length >= 3 && (normalizePlate(v.placaCavalo).includes(qPlate) || normalizePlate(v.placaCarreta).includes(qPlate))))),
    [q, qPlate, search],
  );

  const ui: BoardUi | null = useMemo(
    () =>
      state && {
        vehiclesById: new Map(state.vehicles.map((v) => [v.id, v])),
        searchActive: !!q,
        onlyAlerts,
        matches,
        openFrota: setFrotaId,
        openGroup: (groupId, columnId, seedVehicleId) => setGroupDlg({ groupId, columnId, seedVehicleId }),
      },
    [state, q, onlyAlerts, matches],
  );
  const layout = useMemo(() => (state ? buildSheetLayout(state.columns, UNIT) : null), [state]);

  if (!state || !ui || !layout) return null;
  const H = layout.headerRows;
  const units = layout.leaves.reduce((a, l) => a + l.span, 0);

  return (
    <BoardUiContext.Provider value={ui}>
      {isEditor && (
        <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-xs text-slate-500">Arraste as frotas entre as colunas · clique no cabeçalho azul de um bloco para editar</span>
          <Button variant="outline" size="sm" onClick={() => setColumnDlg('exportacao')}>
            <Plus className="h-3.5 w-3.5" /> Novo destino
          </Button>
          <Button variant="outline" size="sm" onClick={() => setColumnDlg('importacao')}>
            <Plus className="h-3.5 w-3.5" /> Nova coluna de importação
          </Button>
        </div>
      )}

      <div className="board-scroll overflow-x-auto rounded-md border-4 border-[#004B87] bg-[#004B87] shadow-md">
        <div style={{ minWidth: units * UNIT }}>
          {/* Faixa de título, como na planilha */}
          <div className="grid grid-cols-[minmax(170px,1fr)_auto_minmax(170px,1fr)] items-center border-b-4 border-[#004B87] bg-white px-3 py-1.5">
            <div className="justify-self-start">
              <Logo />
            </div>
            <h2 className="px-4 text-center text-2xl font-bold tracking-wide text-[#1F4E79]">PROGRAMAÇÃO FROTAS</h2>
            <div className="justify-self-end">
              <Logo />
            </div>
          </div>

          <div
            className="grid bg-white"
            style={{ gridTemplateColumns: layout.gridTemplateColumns, gridTemplateRows: `repeat(${H}, 20px) minmax(460px, auto) 24px` }}
          >
            {layout.headers.map((h) => (
              <div
                key={h.key}
                style={{ gridColumn: `${h.colStart} / ${h.colEnd}`, gridRow: h.row }}
                className={cn(
                  HEADER_BG,
                  'flex items-center justify-center truncate border-b border-r border-white/30 px-1 text-[11px] font-bold uppercase leading-none text-white',
                )}
                title={h.title}
              >
                {h.title}
              </div>
            ))}

            {layout.leaves.map((leaf) => (
              <SheetColumn
                key={leaf.column.id}
                leaf={leaf}
                style={{ gridColumn: `${leaf.colStart} / ${leaf.colEnd}`, gridRow: `${leaf.bodyRow} / ${H + 2}` }}
              />
            ))}

            {layout.leaves.map((leaf, i) => (
              <div
                key={`total-${leaf.column.id}`}
                style={{ gridColumn: `${leaf.colStart} / ${leaf.colEnd}`, gridRow: H + 2 }}
                className={cn(HEADER_BG, 'relative flex items-center justify-center border-r border-white/30 text-xs font-bold tabular-nums text-white')}
              >
                {columnCount(state, leaf.column.id)}
                {i === layout.leaves.length - 1 && (
                  <span className="absolute right-1.5 rounded bg-white/15 px-1.5 text-[11px]" title="Total de frotas">
                    {state.vehicles.length}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {frotaId && <FrotaDialog vehicleId={frotaId} onClose={() => setFrotaId(null)} />}
      {groupDlg && <GroupDialog {...groupDlg} onClose={() => setGroupDlg(null)} />}
      {columnDlg && <ColumnDialog section={columnDlg} onClose={() => setColumnDlg(null)} />}
    </BoardUiContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Coluna da planilha
// ---------------------------------------------------------------------------
function SheetColumn({ leaf, style }: { leaf: SheetLeaf; style: CSSProperties }) {
  const { state, mutate } = useBoard();
  const { isEditor } = useAuth();
  const ui = useBoardUi();
  const [over, setOver] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  if (!state) return null;

  const column = leaf.column;
  const isSem = column.id === SEM_PROGRAMACAO;
  const groups = state.groups.filter((g) => g.columnId === column.id);
  const empty = columnCount(state, column.id) === 0;

  function onDrop(e: DragEvent) {
    if (!isEditor) return;
    e.preventDefault();
    setOver(false);
    const id = readDraggedId(e);
    if (!id) return;
    if (isSem) return mutate((s) => moveFrota(s, id, null));
    if (leaf.kind === 'lista') {
      // coluna de lista (VAZIOS, GUA X URU…): entra na lista, sem criar bloco com cabeçalho
      return mutate((s) => {
        const target = s.groups.find((g) => g.columnId === column.id && isBlank(g));
        if (target) return moveFrota(s, id, target.id);
        const [next, gid] = addGroup(s, { columnId: column.id, frotaIds: [] });
        return moveFrota(next, id, gid);
      });
    }
    ui.openGroup(null, column.id, id); // coluna de blocos: pede Programação/CRT
  }

  return (
    <div
      style={style}
      onDragOver={(e) => {
        if (!isEditor) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={onDrop}
      className={cn('group/col relative flex min-w-0 flex-col border-r-2 border-[#004B87] transition-colors', over ? 'bg-[#DDEBF7]' : 'bg-white')}
    >
      {isSem ? (
        <CellList vehicles={unassignedVehicles(state)} span={leaf.span} column={column} />
      ) : (
        groups.map((g, idx) => (
          <SheetBlock key={g.id} group={g} column={column} span={leaf.span} kind={leaf.kind} first={idx === 0} />
        ))
      )}
      {!isSem && leaf.kind === 'blocos' && groups.length > 0 && <div className={cn(BAND_BG, 'h-4 shrink-0')} />}

      {isEditor && !isSem && (
        <div className="mt-auto flex items-center justify-center gap-1 py-1 opacity-0 transition group-hover/col:opacity-100">
          {leaf.kind === 'blocos' && (
            <button onClick={() => ui.openGroup(null, column.id)} className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold text-[#004B87] hover:bg-[#DDEBF7]" title="Novo bloco Programação / CRT">
              <Plus className="h-3 w-3" /> bloco
            </button>
          )}
          {empty && column.section !== 'status' && (
            confirmRemove ? (
              <button onClick={() => mutate((s) => removeColumn(s, column.id))} onMouseLeave={() => setConfirmRemove(false)} className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                Remover?
              </button>
            ) : (
              <button onClick={() => setConfirmRemove(true)} className="rounded p-1 text-slate-400 hover:text-red-600" title="Remover coluna vazia">
                <Trash2 className="h-3 w-3" />
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bloco P/CRT (cabeçalho azul + linhas de frotas)
// ---------------------------------------------------------------------------
function SheetBlock({ group, column, span, kind, first }: { group: Group; column: Column; span: number; kind: SheetLeaf['kind']; first: boolean }) {
  const { mutate } = useBoard();
  const { isEditor } = useAuth();
  const ui = useBoardUi();
  const [over, setOver] = useState(false);
  const vehicles = group.frotaIds.map((id) => ui.vehiclesById.get(id)).filter(Boolean) as Vehicle[];
  const blank = isBlank(group);
  const code = [group.programacao && `P: ${group.programacao}`, group.crt && `CRT ${group.crt}`].filter(Boolean).join(' - ');

  return (
    <div
      onDragOver={(e) => {
        if (!isEditor) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={(e) => {
        if (!isEditor) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        const id = readDraggedId(e);
        if (id) mutate((s) => moveFrota(s, id, group.id));
      }}
      className={cn('shrink-0', over && 'outline outline-2 -outline-offset-2 outline-[#F4B183]')}
    >
      {/* blocos sem identificação são separados por uma faixa azul, como na planilha */}
      {blank && !first && kind === 'blocos' && <div className={cn(BAND_BG, 'h-4')} />}
      {!blank && (
        <button
          type="button"
          onClick={() => isEditor && ui.openGroup(group.id, column.id)}
          title={[group.label, code, group.cliente].filter(Boolean).join(' · ')}
          className={cn(
            BAND_BG,
            'group/hdr relative flex w-full flex-col items-center justify-center px-0.5 py-[3px] text-center text-[10px] font-bold uppercase leading-[13px] tracking-[-0.02em] text-white',
            isEditor ? 'cursor-pointer hover:brightness-110' : 'cursor-default',
          )}
        >
          {group.label && <span className="w-full truncate">{group.label}</span>}
          {code && <span className="w-full whitespace-nowrap">{code}</span>}
          {isEditor && <Pencil className="absolute right-1 top-1 h-2.5 w-2.5 opacity-0 group-hover/hdr:opacity-80" />}
        </button>
      )}
      <CellList vehicles={vehicles} span={span} column={column} group={group} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Linhas de frota (uma célula por frota, cor = macro, rosa = alerta)
// ---------------------------------------------------------------------------
function CellList({ vehicles, span, column, group }: { vehicles: Vehicle[]; span: number; column: Column; group?: Group }) {
  if (!vehicles.length) return null;
  const expected = expectedMacros(column, group);
  if (span === 1) {
    return (
      <div>
        {vehicles.map((v) => (
          <FrotaCell key={v.id} vehicle={v} alert={macroAlert(v, expected)} />
        ))}
      </div>
    );
  }
  // colunas duplas: preenche a primeira coluna de cima para baixo e continua na segunda
  const rows = Math.max(Math.ceil(vehicles.length / span), Math.min(vehicles.length, ROWS_PER_COLUMN));
  return (
    <div className="grid grid-flow-col" style={{ gridTemplateRows: `repeat(${rows}, 18px)`, gridTemplateColumns: `repeat(${span}, minmax(0, 1fr))` }}>
      {vehicles.map((v) => (
        <FrotaCell key={v.id} vehicle={v} alert={macroAlert(v, expected)} />
      ))}
    </div>
  );
}

function FrotaCell({ vehicle, alert }: { vehicle: Vehicle; alert: ReturnType<typeof vehicleAlert> }) {
  const { isEditor } = useAuth();
  const ui = useBoardUi();
  const match = ui.matches(vehicle);
  const highlighted = ui.searchActive && match;
  const dimmed = (ui.searchActive && !match) || (ui.onlyAlerts && !alert);

  return (
    <button
      type="button"
      draggable={isEditor}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_MIME, vehicle.id);
        e.dataTransfer.setData('text/plain', vehicle.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={() => ui.openFrota(vehicle.id)}
      title={`Frota ${vehicle.frota} · ${formatPlate(vehicle.placaCavalo)} / ${formatPlate(vehicle.placaCarreta)}\n${vehicle.motorista}\nMacro: ${MACROS[vehicle.macro].label}${alert ? `\n⚠ ${alert.message}` : ''}`}
      className={cn(
        'block h-[18px] w-full min-w-0 overflow-hidden border-b border-r border-white px-1.5 text-left text-[12px] font-semibold leading-[17px] tabular-nums hover:brightness-95',
        alert ? ALERT_CELL : MACROS[vehicle.macro].cell,
        highlighted && 'relative z-[1] outline outline-2 -outline-offset-2 outline-[#004B87]',
        dimmed && 'opacity-25',
        isEditor ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
      )}
    >
      {vehicle.frota}
    </button>
  );
}
