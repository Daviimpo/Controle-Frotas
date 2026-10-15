import type { Column, Group, Macro, Vehicle } from './types';
import { hoursSince } from './utils';

/** Horas sem atualização do macro no rastreador até gerar alerta */
export const STALE_HOURS = 12;

export const MACRO_ORDER: Macro[] = ['carregamento', 'viagem', 'descarregando', 'vazio'];

export const MACROS: Record<Macro, { label: string; dot: string; badge: string }> = {
  carregamento: {
    label: 'Carregamento',
    dot: 'bg-amber-500',
    badge: 'bg-amber-50 text-amber-800 ring-amber-200',
  },
  viagem: {
    label: 'Viagem',
    dot: 'bg-blue-600',
    badge: 'bg-blue-50 text-blue-800 ring-blue-200',
  },
  descarregando: {
    label: 'Descarregando',
    dot: 'bg-violet-500',
    badge: 'bg-violet-50 text-violet-800 ring-violet-200',
  },
  vazio: {
    label: 'Vazio',
    dot: 'bg-slate-400',
    badge: 'bg-slate-100 text-slate-700 ring-slate-200',
  },
};

export function expectedMacros(column?: Column, group?: Group): Macro[] | undefined {
  return group?.expectedMacros ?? column?.expectedMacros;
}

export interface MacroAlert {
  type: 'stale' | 'mismatch';
  message: string;
}

export function macroAlert(v: Vehicle, expected?: Macro[], now = Date.now()): MacroAlert | null {
  if (expected && expected.length && !expected.includes(v.macro)) {
    return {
      type: 'mismatch',
      message: `Macro "${MACROS[v.macro].label}" não confere com a posição no quadro (esperado: ${expected
        .map((m) => MACROS[m].label)
        .join(' / ')})`,
    };
  }
  const h = hoursSince(v.macroUpdatedAt, now);
  if (h > STALE_HOURS) {
    return { type: 'stale', message: `Macro sem atualização no rastreador há ${Math.floor(h)}h` };
  }
  return null;
}
