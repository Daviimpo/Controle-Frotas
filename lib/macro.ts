import type { BoardState, Column, Group, Macro, Vehicle } from './types';
import { hoursSince, normalizeText } from './utils';

/** Horas sem atualização do macro no rastreador até gerar alerta */
export const STALE_HOURS = 12;

export const MACRO_ORDER: Macro[] = ['vazio', 'destinado', 'carga', 'viagem', 'descarga', 'manutencao'];

/** Célula da planilha quando a frota está em alerta (rosa/vermelho, como no Excel) */
export const ALERT_CELL = 'bg-[#FFC7CE] text-[#C00000]';

/**
 * Cores oficiais das macros (mesmas da planilha operacional).
 * - chip: badge da frota no quadro (bg + texto + borda)
 * - badge: rótulos com ring (diálogos, tabelas)
 * - dot: marcador pequeno (legendas)
 * - cell: célula do Quadro no estilo da planilha PROGRAMAÇÃO FROTAS (tons do Excel)
 * As classes ficam escritas por extenso para o Tailwind gerá-las.
 */
export const MACROS: Record<Macro, { label: string; chip: string; badge: string; dot: string; cell: string }> = {
  vazio: {
    cell: 'bg-[#FFE699] text-[#1F4E79]',
    label: 'Vazio',
    chip: 'bg-[#FFF2CC] text-[#B45F06] border-[#FFE599]',
    badge: 'bg-[#FFF2CC] text-[#B45F06] ring-[#FFE599]',
    dot: 'bg-[#B45F06]',
  },
  destinado: {
    cell: 'bg-[#C6E0B4] text-[#1F4E79]',
    label: 'Destinado',
    chip: 'bg-[#D9EAD3] text-[#274E13] border-[#B6D7A8]',
    badge: 'bg-[#D9EAD3] text-[#274E13] ring-[#B6D7A8]',
    dot: 'bg-[#274E13]',
  },
  carga: {
    cell: 'bg-[#B4C6E7] text-[#1F4E79]',
    label: 'Carga',
    chip: 'bg-[#C9DAF8] text-[#1C4587] border-[#A4C2F4]',
    badge: 'bg-[#C9DAF8] text-[#1C4587] ring-[#A4C2F4]',
    dot: 'bg-[#1C4587]',
  },
  viagem: {
    cell: 'bg-[#BDD7EE] text-[#1F4E79]',
    label: 'Viagem',
    chip: 'bg-[#CFE2F3] text-[#0B5394] border-[#9FC5E8]',
    badge: 'bg-[#CFE2F3] text-[#0B5394] ring-[#9FC5E8]',
    dot: 'bg-[#0B5394]',
  },
  descarga: {
    cell: 'bg-[#F8CBAD] text-[#1F4E79]',
    label: 'Descarga',
    chip: 'bg-[#FCE5CD] text-[#783F04] border-[#F9CB9C]',
    badge: 'bg-[#FCE5CD] text-[#783F04] ring-[#F9CB9C]',
    dot: 'bg-[#783F04]',
  },
  manutencao: {
    cell: 'bg-white text-[#595959]',
    label: 'Manutenção',
    chip: 'bg-[#EFEFEF] text-[#434343] border-[#D9D9D9]',
    badge: 'bg-[#EFEFEF] text-[#434343] ring-[#D9D9D9]',
    dot: 'bg-[#434343]',
  },
};

/** Nomes antigos / variações vindas do rastreador ou de planilhas */
const ALIASES: Record<string, Macro> = {
  carregamento: 'carga',
  carregando: 'carga',
  carregado: 'carga',
  descarregando: 'descarga',
  descarregamento: 'descarga',
  manutencao: 'manutencao',
  oficina: 'manutencao',
};

/** Aceita "VIAGEM", "Manutenção", "carregamento"… e devolve a macro padronizada (padrão: viagem) */
export function normalizeMacro(value: unknown): Macro {
  const k = normalizeText(String(value ?? '')).replace(/[^a-z]/g, '');
  if (k in MACROS) return k as Macro;
  return ALIASES[k] ?? 'viagem';
}

/** Converte estados salvos com macros antigas para o padrão atual */
export function migrateMacros(state: BoardState): BoardState {
  const fix = (list?: Macro[]) => (list ? Array.from(new Set(list.map(normalizeMacro))) : undefined);
  return {
    ...state,
    vehicles: state.vehicles.map((v) => ({ ...v, macro: normalizeMacro(v.macro) })),
    columns: state.columns.map((c) => ({ ...c, expectedMacros: fix(c.expectedMacros) })),
    groups: state.groups.map((g) => ({ ...g, expectedMacros: fix(g.expectedMacros) })),
  };
}

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
