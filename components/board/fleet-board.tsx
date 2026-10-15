'use client';

import { useCallback, useMemo, useState } from 'react';
import { Globe, Navigation, PackageOpen, Plus } from 'lucide-react';
import type { Section, Vehicle } from '@/lib/types';
import { sectionCount, unassignedVehicles } from '@/lib/board-ops';
import { normalizePlate, normalizeText } from '@/lib/utils';
import { useAuth } from '@/components/providers/auth-provider';
import { useBoard } from '@/components/providers/board-provider';
import { Button, Card } from '@/components/ui';
import { BoardUiContext, type BoardUi } from './board-ui';
import { BoardColumn } from './board-column';
import { ColumnDialog, FrotaDialog, GroupDialog } from './dialogs';

const SECTIONS: { id: Section; title: string; description: string; icon: typeof Globe; tone: string }[] = [
  { id: 'exportacao', title: 'Exportação', description: 'Destinos · blocos de Programação + CRT', icon: Globe, tone: 'bg-navy text-white' },
  { id: 'status', title: 'Status Operacionais', description: 'A caminho, aguardando carga, voltando e sem programação', icon: Navigation, tone: 'bg-slate-700 text-white' },
  { id: 'importacao', title: 'Importação', description: 'Uruguai e Argentina · CRTs de retorno', icon: PackageOpen, tone: 'bg-emerald-700 text-white' },
];

export function FleetBoard({ search, onlyAlerts }: { search: string; onlyAlerts: boolean }) {
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

  if (!state || !ui) return null;

  return (
    <BoardUiContext.Provider value={ui}>
      <div className="space-y-5">
        {SECTIONS.map((sec) => {
          const cols = state.columns.filter((c) => c.section === sec.id);
          const count = sectionCount(state, sec.id) + (sec.id === 'status' ? unassignedVehicles(state).length : 0);
          return (
            <Card key={sec.id} className="overflow-hidden">
              <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                <div className={`grid h-8 w-8 place-items-center rounded-lg ${sec.tone}`}>
                  <sec.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-bold text-slate-900">
                    {sec.title} <span className="ml-1 text-sm font-semibold text-slate-400">· {count} frotas</span>
                  </h3>
                  <p className="truncate text-xs text-slate-500">{sec.description}</p>
                </div>
                {isEditor && (
                  <Button variant="outline" size="sm" onClick={() => setColumnDlg(sec.id)}>
                    <Plus className="h-3.5 w-3.5" />
                    {sec.id === 'exportacao' ? 'Novo destino' : 'Nova coluna'}
                  </Button>
                )}
              </div>
              <div className="board-scroll flex gap-3 overflow-x-auto p-3">
                {cols.map((c) => (
                  <BoardColumn key={c.id} column={c} />
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      {frotaId && <FrotaDialog vehicleId={frotaId} onClose={() => setFrotaId(null)} />}
      {groupDlg && <GroupDialog {...groupDlg} onClose={() => setGroupDlg(null)} />}
      {columnDlg && <ColumnDialog section={columnDlg} onClose={() => setColumnDlg(null)} />}
    </BoardUiContext.Provider>
  );
}
