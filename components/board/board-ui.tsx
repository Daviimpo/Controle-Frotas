'use client';

import { createContext, useContext } from 'react';
import type { Vehicle } from '@/lib/types';

export const DRAG_MIME = 'text/x-polivias-frota';

export interface BoardUi {
  vehiclesById: Map<string, Vehicle>;
  searchActive: boolean;
  onlyAlerts: boolean;
  matches: (v: Vehicle) => boolean;
  openFrota: (vehicleId: string) => void;
  openGroup: (groupId: string | null, columnId: string, seedVehicleId?: string) => void;
}

export const BoardUiContext = createContext<BoardUi | null>(null);

export function useBoardUi() {
  const ctx = useContext(BoardUiContext);
  if (!ctx) throw new Error('useBoardUi fora do PlanilhaBoard');
  return ctx;
}

/** Hook utilitário para destacar áreas de drop */
export function readDraggedId(e: React.DragEvent) {
  return e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData('text/plain');
}
