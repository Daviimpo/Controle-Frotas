'use client';

import { AlertTriangle } from 'lucide-react';
import type { MacroAlert } from '@/lib/macro';
import { MACROS } from '@/lib/macro';
import type { Vehicle } from '@/lib/types';
import { cn, formatPlate } from '@/lib/utils';
import { useAuth } from '@/components/providers/auth-provider';
import { DRAG_MIME, useBoardUi } from './board-ui';

export function FrotaChip({ vehicle, alert }: { vehicle: Vehicle; alert: MacroAlert | null }) {
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
        'group inline-flex items-center gap-1.5 rounded-md border bg-white px-2 py-1 text-xs font-bold shadow-sm transition-all hover:-translate-y-px hover:border-brand hover:shadow',
        alert ? (alert.type === 'mismatch' ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50') : 'border-slate-200',
        highlighted && 'ring-2 ring-brand ring-offset-1',
        dimmed && 'opacity-25',
        isEditor ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
      )}
    >
      <span className={cn('h-2 w-2 shrink-0 rounded-full', MACROS[vehicle.macro].dot)} />
      <span className="tabular-nums text-navy">{vehicle.frota}</span>
      {alert && <AlertTriangle className={cn('h-3 w-3', alert.type === 'mismatch' ? 'text-red-600' : 'text-amber-600')} />}
    </button>
  );
}
