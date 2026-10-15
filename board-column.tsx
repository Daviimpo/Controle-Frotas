'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Column } from '@/lib/types';
import { SEM_PROGRAMACAO } from '@/lib/mock-data';
import { columnCount, moveFrota, removeColumn, unassignedVehicles } from '@/lib/board-ops';
import { macroAlert } from '@/lib/macro';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/providers/auth-provider';
import { useBoard } from '@/components/providers/board-provider';
import { readDraggedId, useBoardUi } from './board-ui';
import { GroupBlock } from './group-block';
import { FrotaChip } from './frota-chip';

const ACCENT: Record<Column['section'], string> = {
  exportacao: 'border-t-navy',
  status: 'border-t-slate-400',
  importacao: 'border-t-emerald-600',
};

export function BoardColumn({ column }: { column: Column }) {
  const { isEditor } = useAuth();
  const { state, mutate } = useBoard();
  const ui = useBoardUi();
  const [over, setOver] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  if (!state) return null;

  const isSem = column.id === SEM_PROGRAMACAO;
  const groups = state.groups.filter((g) => g.columnId === column.id);
  const loose = isSem ? unassignedVehicles(state) : [];
  const total = columnCount(state, column.id);
  const canRemove = isEditor && !isSem && total === 0;

  return (
    <div
      onDragOver={(e) => {
        if (!isEditor) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={(e) => {
        if (!isEditor) return;
        e.preventDefault();
        setOver(false);
        const id = readDraggedId(e);
        if (!id) return;
        // Solto na coluna (fora de um bloco): "Sem Programação" libera a frota; nas demais cria um novo bloco
        if (isSem) mutate((s) => moveFrota(s, id, null));
        else ui.openGroup(null, column.id, id);
      }}
      className={cn(
        'flex w-[272px] shrink-0 flex-col rounded-xl border border-t-[3px] bg-slate-50/80 transition',
        ACCENT[column.section],
        isSem && 'border-dashed bg-white',
        over ? 'border-brand bg-brand-50/60' : 'border-slate-200',
      )}
    >
      <div className="flex items-start gap-2 px-3 pb-2 pt-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h4 className="truncate text-sm font-bold text-slate-800">{column.title}</h4>
            {column.country && (
              <span className="rounded bg-white px-1 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200">{column.country}</span>
            )}
          </div>
          {column.subtitle && <p className="truncate text-[11px] text-slate-500">{column.subtitle}</p>}
        </div>
        <span className="rounded-full bg-navy px-2 py-0.5 text-[11px] font-bold tabular-nums text-white">{total}</span>
      </div>

      <div className="flex flex-1 flex-col gap-2 px-2 pb-2">
        {isSem ? (
          <div className="flex min-h-[60px] flex-wrap content-start gap-1.5 rounded-lg p-1">
            {loose.length === 0 && <span className="p-2 text-[11px] italic text-slate-400">Todas as frotas estão programadas</span>}
            {loose.map((v) => (
              <FrotaChip key={v.id} vehicle={v} alert={macroAlert(v)} />
            ))}
          </div>
        ) : (
          <>
            {groups.map((g) => (
              <GroupBlock key={g.id} group={g} column={column} />
            ))}
            {groups.length === 0 && (
              <div className="grid min-h-[60px] place-items-center rounded-lg border border-dashed border-slate-300 text-[11px] italic text-slate-400">
                {isEditor ? 'Solte uma frota para criar um bloco' : 'Sem programações'}
              </div>
            )}
          </>
        )}

        {isEditor && !isSem && (
          <div className="mt-auto flex items-center gap-1 pt-1">
            <button
              onClick={() => ui.openGroup(null, column.id)}
              className="flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium text-slate-500 hover:bg-white hover:text-navy"
            >
              <Plus className="h-3.5 w-3.5" />
              {column.section === 'status' ? 'Novo grupo' : 'Nova programação / CRT'}
            </button>
            {canRemove &&
              (confirmRemove ? (
                <button
                  onClick={() => mutate((s) => removeColumn(s, column.id))}
                  onMouseLeave={() => setConfirmRemove(false)}
                  className="rounded-md bg-red-600 px-2 py-1 text-[11px] font-semibold text-white"
                >
                  Remover?
                </button>
              ) : (
                <button onClick={() => setConfirmRemove(true)} className="rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-red-600" title="Remover coluna vazia">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
