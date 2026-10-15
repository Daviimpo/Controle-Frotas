'use client';

import { AlertTriangle } from 'lucide-react';
import type { MacroAlert } from '@/lib/macro';
import { MACROS } from '@/lib/macro';
import type { Vehicle } from '@/lib/types';
import { cn, formatPlate } from '@/lib/utils';
import { useAuth } from '@/components/providers/auth-provider';
import { DRAG_MIME, useBoardUi } from './board-ui';

/** Frota no quadro: cor = macro do rastreador · contorno vermelho/âmbar = alerta */
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
        'inline-flex items-center gap-1 rounded border px-2.5 py-1 text-xs font-bold tabular-nums shadow-sm transition-all hover:-translate-y-px hover:shadow',
        MACROS[vehicle.macro].chip,
        alert && (alert.type === 'mismatch' ? 'ring-2 ring-red-500' : 'ring-2 ring-amber-400'),
        highlighted && 'ring-2 ring-navy ring-offset-2',
        dimmed && 'opacity-25',
        isEditor ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
      )}
    >
      {vehicle.frota}
      {alert && <AlertTriangle className={cn('h-3 w-3', alert.type === 'mismatch' ? 'text-red-600' : 'text-amber-600')} />}
    </button>
  );
}
