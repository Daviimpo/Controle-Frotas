import type { BoardState, Column, Group, Macro, Vehicle } from './types';
import { hoursSince, normalizeText } from './utils';

/** Horas sem atualização do macro no rastreador até gerar alerta */
export const STALE_HOURS = 12;

export const MACRO_ORDER: Macro[] = ['vazio', 'destinado', 'carga', 'viagem', 'descarga', 'manutencao'];

/**
 * Cores oficiais das macros (mesmas da planilha operacional).
 * - chip: badge da frota no quadro (bg + texto + borda)
 * - badge: rótulos com ring (diálogos, tabelas)
 * - dot: marcador pequeno (legendas)
 * As classes ficam escritas por extenso para o Tailwind gerá-las.
 */
export const MACROS: Record<Macro, { label: string; chip: string; badge: string; dot: string }> = {
  vazio: {
    label: 'Vazio',
    chip: 'bg-[#FFF2CC] text-[#B45F06] border-[#FFE599]',
    badge: 'bg-[#FFF2CC] text-[#B45F06] ring-[#FFE599]',
    dot: 'bg-[#B45F06]',
  },
  destinado: {
    label: 'Destinado',
    chip: 'bg-[#D9EAD3] text-[#274E13] border-[#B6D7A8]',
    badge: 'bg-[#D9EAD3] text-[#274E13] ring-[#B6D7A8]',
    dot: 'bg-[#274E13]',
  },
  carga: {
    label: 'Carga',
    chip: 'bg-[#C9DAF8] text-[#1C4587] border-[#A4C2F4]',
    badge: 'bg-[#C9DAF8] text-[#1C4587] ring-[#A4C2F4]',
    dot: 'bg-[#1C4587]',
  },
  viagem: {
    label: 'Viagem',
    chip: 'bg-[#D9D2E9] text-[#3D1E6D] border-[#B4A7D6]',
    badge: 'bg-[#D9D2E9] text-[#3D1E6D] ring-[#B4A7D6]',
    dot: 'bg-[#3D1E6D]',
  },
  descarga: {
    label: 'Descarga',
    chip: 'bg-[#FCE5CD] text-[#783F04] border-[#F9CB9C]',
    badge: 'bg-[#FCE5CD] text-[#783F04] ring-[#F9CB9C]',
    dot: 'bg-[#783F04]',
  },
  manutencao: {
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
    columns: state
