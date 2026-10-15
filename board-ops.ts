/**
 * Operações puras (imutáveis) sobre o estado do quadro.
 * Toda alteração passa por aqui — fácil de testar e de portar para um backend.
 */
import type { BoardState, Column, Group, Macro, Section, Vehicle, VehicleInput } from './types';
import { SEM_PROGRAMACAO } from './mock-data';
import { expectedMacros, macroAlert } from './macro';
import { normalizePlate, slugify, uid } from './utils';

export function locate(state: BoardState, vehicleId: string): { group?: Group; column?: Column } {
  const group = state.groups.find((g) => g.frotaIds.includes(vehicleId));
  const columnId = group ? group.columnId : SEM_PROGRAMACAO;
  return { group, column: state.columns.find((c) => c.id === columnId) };
}

export function groupTitle(g: Pick<Group, 'label' | 'programacao' | 'crt'>) {
  const parts: string[] = [];
  if (g.label) parts.push(g.label);
  if (g.programacao) parts.push(`P: ${g.programacao}`);
  if (g.crt) parts.push(`CRT ${g.crt}`);
  return parts.join(' – ') || 'Bloco sem identificação';
}

export function locationLabel(state: BoardState, vehicleId: string) {
  const { group, column } = locate(state, vehicleId);
  if (!group) return 'Sem Programação';
  return `${column?.title ?? '—'} · ${groupTitle(group)}`;
}

export function unassignedVehicles(state: BoardState): Vehicle[] {
  const assigned = new Set(state.groups.flatMap((g) => g.frotaIds));
  return state.vehicles.filter((v) => !assigned.has(v.id));
}

export function vehicleAlert(state: BoardState, v: Vehicle) {
  const { group, column } = locate(state, v.id);
  return macroAlert(v, expectedMacros(column, group));
}

export function sectionCount(state: BoardState, section: Section) {
  const ids = new Set(state.columns.filter((c) => c.section === section).map((c) => c.id));
  return state.groups.filter((g) => ids.has(g.columnId)).reduce((acc, g) => acc + g.frotaIds.length, 0);
}

export function columnCount(state: BoardState, columnId: string) {
  if (columnId === SEM_PROGRAMACAO) return unassignedVehicles(state).length;
  return state.groups.filter((g) => g.columnId === columnId).reduce((a, g) => a + g.frotaIds.length, 0);
}

// ---------- Mutações ----------

/** Move uma frota para um bloco (ou para "Sem Programação" quando toGroupId = null) */
export function moveFrota(state: BoardState, vehicleId: string, toGroupId: string | null): BoardState {
  const groups = state.groups.map((g) => {
    const without = g.frotaIds.filter((id) => id !== vehicleId);
    if (g.id === toGroupId) return { ...g, frotaIds: [...without, vehicleId] };
    return without.length === g.frotaIds.length ? g : { ...g, frotaIds: without };
  });
  return { ...state, groups };
}

export function addGroup(
  state: BoardState,
  data: Omit<Group, 'id' | 'createdAt'>,
): [BoardState, string] {
  const id = uid('g');
  const group: Group = { ...data, id, createdAt: new Date().toISOString() };
  return [{ ...state, groups: [...state.groups, group] }, id];
}

export function updateGroup(state: BoardState, id: string, patch: Partial<Group>): BoardState {
  return { ...state, groups: state.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) };
}

/** Remove o bloco; as frotas voltam para "Sem Programação" */
export function deleteGroup(state: BoardState, id: string): BoardState {
  return { ...state, groups: state.groups.filter((g) => g.id !== id) };
}

export function addColumn(state: BoardState, data: Omit<Column, 'id'>): BoardState {
  let id = slugify(data.title) || uid('col');
  while (state.columns.some((c) => c.id === id)) id = `${id}-${Math.random().toString(36).slice(2, 5)}`;
  const defaults =
    data.section === 'exportacao'
      ? (['viagem', 'descarga'] as const)
      : data.section === 'importacao'
        ? (['carga', 'viagem', 'descarga'] as const)
        : undefined;
  const column: Column = { expectedMacros: defaults ? [...defaults] : undefined, ...data, id };
  // insere após a última coluna da mesma seção
  const lastIdx = state.columns.map((c) => c.section).lastIndexOf(data.section);
  const columns = [...state.columns];
  columns.splice(lastIdx + 1, 0, column);
  return { ...state, columns };
}

export function removeColumn(state: BoardState, columnId: string): BoardState {
  if (columnId === SEM_PROGRAMACAO) return state;
  return {
    ...state,
    columns: state.columns.filter((c) => c.id !== columnId),
    groups: state.groups.filter((g) => g.columnId !== columnId),
  };
}

export function updateVehicle(state: BoardState, id: string, patch: Partial<Vehicle>): BoardState {
  return { ...state, vehicles: state.vehicles.map((v) => (v.id === id ? { ...v, ...patch } : v)) };
}

export function addVehicle(state: BoardState, input: VehicleInput): BoardState {
  let id = `v-${input.frota}`;
  if (state.vehicles.some((v) => v.id === id)) id = uid('v');
  const vehicle: Vehicle = { ...input, id, macro: 'vazio', macroUpdatedAt: new Date().toISOString() };
  return { ...state, vehicles: [...state.vehicles, vehicle] };
}

export function deleteVehicle(state: BoardState, id: string): BoardState {
  return {
    ...state,
    vehicles: state.vehicles.filter((v) => v.id !== id),
    groups: state.groups.map((g) => ({ ...g, frotaIds: g.frotaIds.filter((x) => x !== id) })),
  };
}

/**
 * Importação da planilha base.
 * - merge: atualiza pelo número da frota e adiciona as novas
 * - replace: o cadastro passa a ser exatamente a planilha (frotas removidas saem do quadro)
 */
export function upsertVehicles(
  state: BoardState,
  inputs: VehicleInput[],
  mode: 'merge' | 'replace',
): { state: BoardState; added: number; updated: number; removed: number } {
  const byFrota = new Map(state.vehicles.map((v) => [v.frota.trim(), v]));
  let added = 0;
  let updated = 0;
  const now = new Date().toISOString();
  const usedIds = new Set(state.vehicles.map((v) => v.id));

  const fromSheet: Vehicle[] = inputs.map((inp) => {
    const existing = byFrota.get(inp.frota.trim());
    if (existing) {
      updated++;
      return { ...existing, ...inp };
    }
    added++;
    let id = `v-${inp.frota}`;
    if (usedIds.has(id)) id = uid('v');
    usedIds.add(id);
    return { ...inp, id, macro: 'vazio', macroUpdatedAt: now };
  });

  let vehicles: Vehicle[];
  if (mode === 'replace') {
    vehicles = fromSheet;
  } else {
    // mantém as frotas existentes, substitui as atualizadas e acrescenta as novas
    vehicles = state.vehicles
      .map((v) => fromSheet.find((s) => s.id === v.id) ?? v)
      .concat(fromSheet.filter((s) => !state.vehicles.some((v) => v.id === s.id)));
  }

  const keep = new Set(vehicles.map((v) => v.id));
  const removed = state.vehicles.filter((v) => !keep.has(v.id)).length;
  const groups = state.groups.map((g) => ({ ...g, frotaIds: g.frotaIds.filter((id) => keep.has(id)) }));
  vehicles.sort((a, b) => a.frota.localeCompare(b.frota, 'pt-BR', { numeric: true }));
  return { state: { ...state, vehicles, groups }, added, updated, removed };
}

export function findVehicleByPlate(state: BoardState, plate?: string | null) {
  const p = normalizePlate(plate);
  if (!p) return undefined;
  return state.vehicles.find((v) => normalizePlate(v.placaCavalo) === p || normalizePlate(v.placaCarreta) === p);
}

export interface Allocation {
  vehicleId: string;
  columnId: string;
  programacao?: string;
  crt?: string;
  cliente?: string;
}

/**
 * Aloca frotas extraídas do PDF no quadro.
 * - Agrupa por Programação + CRT (várias frotas no mesmo bloco).
 * - Se o bloco P/CRT já existe (em qualquer coluna), ele é ATUALIZADO: vai para a coluna do destino
 *   e recebe o cliente; senão, é criado.
 * - Cada frota sai do bloco onde estava e entra no bloco da programação.
 * - `macro` (opcional) atualiza a macro das frotas alocadas.
 */
export function applyAllocations(state: BoardState, allocs: Allocation[], macro?: Macro): BoardState {
  let st = state;
  const keyToGroup = new Map<string, string>();
  const now = new Date().toISOString();
  for (const a of allocs) {
    const key = `${a.programacao ?? ''}|${a.crt ?? ''}|${a.crt || a.programacao ? '' : a.columnId}`;
    let gid = keyToGroup.get(key);
    if (!gid) {
      const same = (g: Group) => (g.crt ?? '') === (a.crt ?? '') && (g.programacao ?? '') === (a.programacao ?? '');
      const existing =
        a.crt || a.programacao
          ? st.groups.find((g) => g.columnId === a.columnId && same(g)) ?? st.groups.find(same)
          : undefined;
      if (existing) {
        gid = existing.id;
        st = updateGroup(st, gid, { columnId: a.columnId, ...(a.cliente ? { cliente: a.cliente } : {}) });
      } else {
        const [next, newId] = addGroup(st, {
          columnId: a.columnId,
          programacao: a.programacao || undefined,
          crt: a.crt || undefined,
          cliente: a.cliente || undefined,
          frotaIds: [],
        });
        st = next;
        gid = newId;
      }
      keyToGroup.set(key, gid);
    }
    st = moveFrota(st, a.vehicleId, gid);
    if (macro) st = updateVehicle(st, a.vehicleId, { macro, macroUpdatedAt: now });
  }
  return st;
}

/** Exclusão em massa: remove as frotas do cadastro e de todos os blocos do quadro */
export function deleteVehicles(state: BoardState, ids: string[]): BoardState {
  const drop = new Set(ids);
  return {
    ...state,
    vehicles: state.vehicles.filter((v) => !drop.has(v.id)),
    groups: state.groups.map((g) => ({ ...g, frotaIds: g.frotaIds.filter((x) => !drop.has(x)) })),
  };
}
