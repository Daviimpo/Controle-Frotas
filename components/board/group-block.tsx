'use client';

import { useState } from 'react';
import { FileText, Pencil } from 'lucide-react';
import type { Column, Group, Vehicle } from '@/lib/types';
import { expectedMacros, macroAlert } from '@/lib/macro';
import { moveFrota } from '@/lib/board-ops';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/providers/auth-provider';
import { useBoard } from '@/components/providers/board-provider';
import { readDraggedId, useBoardUi } from './board-ui';
import { FrotaChip } from './frota-chip';

const HEADER_STYLE: Record<Column['section'], string> = {
  exportacao: 'bg-navy text-white',
  importacao: 'bg-emerald-700 text-white',
  status: 'bg-slate-100 text-slate-700',
};

export function GroupBlock({ group, column }: { group: Group; column: Column }) {
  const { isEditor } = useAuth();
  const { mutate } = useBoard();
  const ui = useBoardUi();
  const [over, setOver] = useState(false);

  const vehicles = group.frotaIds.map((id) => ui.vehiclesById.get(id)).filter(Boolean) as Vehicle[];
  const expected = expectedMacros(column, group);
  const hasCode = group.programacao || group.crt;

  return (
    <div
      onDragOver={(e) => {
        if (!isEditor) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
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
      className={cn(
        'overflow-hidden rounded-lg border bg-white shadow-sm transition',
        over ? 'border-brand ring-2 ring-brand/30' : 'border-slate-200',
      )}
    >
      <div className={cn('flex items-center gap-2 px-2.5 py-1.5', HEADER_STYLE[column.section])}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 text-[12px] font-bold leading-5">
            {group.label && <span className="truncate">{group.label}</span>}
            {group.label && hasCode && <span className="opacity-50">·</span>}
            {group.programacao && <span>P: {group.programacao}</span>}
            {group.programacao && group.crt && <span className="opacity-50">–</span>}
            {group.crt && (
              <span className="inline-flex items-center gap-1">
                <FileText className="h-3 w-3 opacity-70" />
                CRT {group.crt}
              </span>
            )}
            {!group.label && !hasCode && <span className="italic opacity-70">Sem identificação</span>}
          </div>
          {group.cliente && <div className="truncate text-[10.5px] font-medium opacity-75">{group.cliente}</div>}
        </div>
        <span className={cn('rounded px-1.5 text-[11px] font-bold tabular-nums', column.section === 'status' ? 'bg-white text-slate-600' : 'bg-white/15')}>
          {vehicles.length}
        </span>
        {isEditor && (
          <button
            onClick={() => ui.openGroup(group.id, column.id)}
            className={cn('rounded p-0.5 opacity-70 hover:opacity-100', column.section === 'status' ? 'hover:bg-slate-200' : 'hover:bg-white/15')}
            title="Editar bloco"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex min-h-[40px] flex-wrap gap-1.5 p-2">
        {vehicles.length === 0 && (
          <span className="self-center px-1 text-[11px] italic text-slate-400">{isEditor ? 'Arraste frotas para cá' : 'Nenhuma frota'}</span>
        )}
        {vehicles.map((v) => (
          <FrotaChip key={v.id} vehicle={v} alert={macroAlert(v, expected)} />
        ))}
      </div>
    </div>
  );
}
