import 'server-only';
import fs from 'fs/promises';
import path from 'path';
import type { PostgrestError } from '@supabase/supabase-js';
import type { BoardState, Column, Group, Macro, Vehicle } from '@/lib/types';
import { createMockState, DEFAULT_COLUMNS } from '@/lib/mock-data';
import { migrateMacros, normalizeMacro } from '@/lib/macro';
import { getSupabase, supabaseConfigured } from './supabase';

/**
 * Persistência do quadro.
 *  - Com SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY: tabelas `frotas`, `quadro_frotas`,
 *    `quadro_colunas` e `quadro_meta` (ver supabase/migrations/0001_controle_frotas.sql).
 *  - Sem Supabase: arquivo JSON local (apenas desenvolvimento).
 *
 * Regras importantes:
 *  - Erros de gravação SEMPRE sobem como exceção (nada de "salvo só em memória").
 *  - O mock só é usado para criar o estado inicial uma única vez; nunca substitui dados existentes.
 *  - O cadastro de frotas (inserir/excluir) só muda via importFrotas/deleteFrotas.
 *    O salvamento do quadro (saveBoard) só altera colunas, blocos e a macro das frotas.
 */
export interface Store {
  read(): Promise<BoardState>;
  saveBoard(next: BoardState, user: string): Promise<BoardState>;
  replaceVehicles(vehicles: Vehicle[], user: string): Promise<BoardState>;
}

export function getStore(): Store {
  return supabaseConfigured() ? supabaseStore : fileStore;
}

export const readState = () => getStore().read();

export function isBoardState(x: unknown): x is BoardState {
  const s = x as BoardState;
  return !!s && Array.isArray(s.vehicles) && Array.isArray(s.columns) && Array.isArray(s.groups);
}

/**
 * Aplica no estado atual apenas o que o quadro pode mudar:
 * colunas, blocos (sem frotas inexistentes) e macro de frotas existentes.
 */
export function mergeBoard(current: BoardState, next: BoardState): BoardState {
  const valid = new Set(current.vehicles.map((v) => v.id));
  const nextById = new Map(next.vehicles.map((v) => [v.id, v]));
  return {
    ...current,
    columns: next.columns,
    groups: next.groups.map((g) => ({ ...g, frotaIds: Array.from(new Set(g.frotaIds.filter((id) => valid.has(id)))) })),
    vehicles: current.vehicles.map((v) => {
      const n = nextById.get(v.id);
      return n ? { ...v, macro: normalizeMacro(n.macro), macroUpdatedAt: n.macroUpdatedAt } : v;
    }),
  };
}

const sortVehicles = (list: Vehicle[]) => [...list].sort((a, b) => a.frota.localeCompare(b.frota, 'pt-BR', { numeric: true }));

// =====================================================================
// Supabase
// =====================================================================
interface FrotaRow {
  id: string;
  frota: string;
  placa_cavalo: string;
  placa_carreta: string;
  motorista: string;
  macro: string;
  macro_updated_at: string;
}
interface ColunaRow {
  id: string;
  titulo: string;
  secao: Column['section'];
  subtitulo: string | null;
  pais: string | null;
  macros_esperadas: string[] | null;
  ordem: number;
}
interface BlocoRow {
  id: string;
  coluna_id: string | null;
  rotulo: string | null;
  programacao: string | null;
  crt: string | null;
  cliente: string | null;
  macros_esperadas: string[] | null;
  frota_ids: string[];
  ordem: number;
  created_at: string;
}
interface MetaRow {
  id: number;
  version: number;
  updated_at: string;
  updated_by: string | null;
}

function ok<T>(res: { data: T | null; error: PostgrestError | null }, what: string): T {
  if (!res.error) return res.data as T;
  const { code, message, details, hint: pgHint } = res.error;
  const extra = [details, pgHint].filter(Boolean).join(' · ');
  let hint = '';
  // PGRST204 / 42703: coluna inexistente · PGRST205 / 42P01: tabela inexistente
  if (code === 'PGRST204' || code === '42703' || code === 'PGRST205' || code === '42P01') {
    hint = ' → O schema do banco está diferente do esperado. Rode supabase/migrations/0001 e 0002 no SQL Editor do Supabase.';
  } else if (code === '23503') {
    hint = ' → Referência a uma coluna do quadro que não existe em quadro_colunas.';
  } else if (code === '22P02' || code === '42804' || code === '23502' || code === '42P10') {
    // tipo incompatível (ex.: id uuid) · NOT NULL sem valor · falta UNIQUE em id
    hint = ' → Tabela legada com tipos/restrições diferentes. Rode supabase/diagnostico_schema.sql e depois supabase/migrations/0002_corrigir_schema_existente.sql.';
  }
  throw new Error(`Supabase (${what}) [${code ?? 's/código'}]: ${message}${extra ? ` (${extra})` : ''}${hint}`);
}

const toFrotaRow = (v: Vehicle): FrotaRow => ({
  id: v.id,
  frota: v.frota,
  placa_cavalo: v.placaCavalo ?? '',
  placa_carreta: v.placaCarreta ?? '',
  motorista: v.motorista ?? '',
  macro: normalizeMacro(v.macro),
  macro_updated_at: v.macroUpdatedAt,
});
const fromFrotaRow = (r: FrotaRow): Vehicle => ({
  id: r.id,
  frota: r.frota,
  placaCavalo: r.placa_cavalo,
  placaCarreta: r.placa_carreta,
  motorista: r.motorista,
  macro: normalizeMacro(r.macro),
  macroUpdatedAt: r.macro_updated_at,
});
const toColunaRow = (c: Column, i: number): ColunaRow => ({
  id: c.id,
  titulo: c.title,
  secao: c.section,
  subtitulo: c.subtitle ?? null,
  pais: c.country ?? null,
  macros_esperadas: c.expectedMacros ?? null,
  ordem: i,
});
const fromColunaRow = (r: ColunaRow): Column => ({
  id: r.id,
  title: r.titulo,
  section: r.secao,
  subtitle: r.subtitulo ?? undefined,
  country: (r.pais ?? undefined) as Column['country'],
  expectedMacros: (r.macros_esperadas ?? undefined) as Macro[] | undefined,
});
const toBlocoRow = (g: Group, i: number): BlocoRow => ({
  id: g.id,
  coluna_id: g.columnId,
  rotulo: g.label ?? null,
  programacao: g.programacao ?? null,
  crt: g.crt ?? null,
  cliente: g.cliente ?? null,
  macros_esperadas: g.expectedMacros ?? null,
  frota_ids: g.frotaIds,
  ordem: i,
  created_at: g.createdAt,
});
const fromBlocoRow = (r: BlocoRow): Group => ({
  id: r.id,
  columnId: r.coluna_id ?? '',
  label: r.rotulo ?? undefined,
  programacao: r.programacao ?? undefined,
  crt: r.crt ?? undefined,
  cliente: r.cliente ?? undefined,
  expectedMacros: (r.macros_esperadas ?? undefined) as Macro[] | undefined,
  frotaIds: r.frota_ids ?? [],
  createdAt: r.created_at,
});

/** Primeira execução: cria colunas padrão (e, se SEED_MOCK_DATA=true, o exemplo) — só em tabelas vazias */
async function bootstrapSupabase() {
  const sb = getSupabase();
  const seed = process.env.SEED_MOCK_DATA === 'true';
  const mock = createMockState();

  const [cols, frotas] = await Promise.all([
    sb.from('quadro_colunas').select('id', { count: 'exact', head: true }),
    sb.from('frotas').select('id', { count: 'exact', head: true }),
  ]);
  ok(cols, 'contar colunas');
  ok(frotas, 'contar frotas');

  if (!cols.count) {
    ok(await sb.from('quadro_colunas').upsert(DEFAULT_COLUMNS.map(toColunaRow), { onConflict: 'id', ignoreDuplicates: true }), 'criar colunas');
  }
  if (seed && !frotas.count) {
    ok(await sb.from('frotas').upsert(mock.vehicles.map(toFrotaRow), { onConflict: 'id', ignoreDuplicates: true }), 'exemplo frotas');
    ok(await sb.from('quadro_frotas').upsert(mock.groups.map(toBlocoRow), { onConflict: 'id', ignoreDuplicates: true }), 'exemplo quadro');
  }
  ok(
    await sb.from('quadro_meta').upsert({ id: 1, version: 1, updated_at: new Date().toISOString(), updated_by: 'sistema' }, { onConflict: 'id', ignoreDuplicates: true }),
    'criar meta',
  );
}

async function bumpMeta(user: string) {
  const sb = getSupabase();
  const meta = ok(await sb.from('quadro_meta').select('version').eq('id', 1).maybeSingle(), 'ler versão') as { version: number } | null;
  ok(
    await sb.from('quadro_meta').upsert({ id: 1, version: (meta?.version ?? 0) + 1, updated_at: new Date().toISOString(), updated_by: user }),
    'gravar versão',
  );
}

const supabaseStore: Store = {
  async read() {
    const sb = getSupabase();
    let meta = ok(await sb.from('quadro_meta').select('*').eq('id', 1).maybeSingle(), 'ler meta') as MetaRow | null;
    if (!meta) {
      await bootstrapSupabase();
      meta = ok(await sb.from('quadro_meta').select('*').eq('id', 1).maybeSingle(), 'ler meta') as MetaRow | null;
    }
    const [cols, blocos, frotas] = await Promise.all([
      sb.from('quadro_colunas').select('*').order('ordem'),
      sb.from('quadro_frotas').select('*').order('ordem'),
      sb.from('frotas').select('*'),
    ]);
    const columns = ok(cols, 'ler colunas').map(fromColunaRow);
    const validCols = new Set(columns.map((c) => c.id));
    return migrateMacros({
      columns,
      groups: ok(blocos, 'ler quadro_frotas')
        .filter((b) => !!b.coluna_id && validCols.has(b.coluna_id)) // blocos legados sem coluna válida são ignorados
        .map(fromBlocoRow),
      vehicles: sortVehicles(ok(frotas, 'ler frotas').map(fromFrotaRow)),
      version: Number(meta?.version ?? 0),
      updatedAt: meta?.updated_at ?? new Date().toISOString(),
      updatedBy: meta?.updated_by ?? undefined,
    });
  },

  async saveBoard(next, user) {
    const sb = getSupabase();
    const current = await this.read();
    const merged = mergeBoard(current, next);

    // 1) colunas (antes dos blocos por causa da FK)
    if (merged.columns.length) ok(await sb.from('quadro_colunas').upsert(merged.columns.map(toColunaRow)), 'salvar colunas');
    // 2) blocos
    if (merged.groups.length) ok(await sb.from('quadro_frotas').upsert(merged.groups.map(toBlocoRow)), 'salvar quadro_frotas');
    const keepGroups = new Set(merged.groups.map((g) => g.id));
    const removedGroups = current.groups.filter((g) => !keepGroups.has(g.id)).map((g) => g.id);
    if (removedGroups.length) ok(await sb.from('quadro_frotas').delete().in('id', removedGroups), 'excluir blocos');
    const keepCols = new Set(merged.columns.map((c) => c.id));
    const removedCols = current.columns.filter((c) => !keepCols.has(c.id)).map((c) => c.id);
    if (removedCols.length) ok(await sb.from('quadro_colunas').delete().in('id', removedCols), 'excluir colunas');
    // 3) macros alteradas
    const before = new Map(current.vehicles.map((v) => [v.id, v]));
    const changed = merged.vehicles.filter((v) => {
      const b = before.get(v.id);
      return b && (b.macro !== v.macro || b.macroUpdatedAt !== v.macroUpdatedAt);
    });
    if (changed.length) ok(await sb.from('frotas').upsert(changed.map((v) => ({ ...toFrotaRow(v), updated_at: new Date().toISOString() }))), 'salvar macros');

    await bumpMeta(user);
    return this.read();
  },

  async replaceVehicles(vehicles, user) {
    const sb = getSupabase();
    const current = await this.read();
    const before = new Map(current.vehicles.map((v) => [v.id, v]));
    const keep = new Set(vehicles.map((v) => v.id));
    const removed = current.vehicles.filter((v) => !keep.has(v.id)).map((v) => v.id);
    const now = new Date().toISOString();
    const upserts = vehicles.filter((v) => JSON.stringify(before.get(v.id)) !== JSON.stringify(v));

    // Exclui primeiro (libera números de frota) — o trigger tira as frotas dos blocos do quadro
    for (let i = 0; i < removed.length; i += 200) {
      ok(await sb.from('frotas').delete().in('id', removed.slice(i, i + 200)), 'excluir frotas');
    }
    for (let i = 0; i < upserts.length; i += 500) {
      ok(await sb.from('frotas').upsert(upserts.slice(i, i + 500).map((v) => ({ ...toFrotaRow(v), updated_at: now }))), 'salvar frotas');
    }
    await bumpMeta(user);
    return this.read();
  },
};

// =====================================================================
// Arquivo JSON (desenvolvimento local)
// =====================================================================
const FILE = path.resolve(process.env.DATA_FILE || path.join(process.cwd(), 'data', 'state.json'));

async function writeFileState(state: BoardState) {
  try {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
    await fs.rename(tmp, FILE);
  } catch (err) {
    throw new Error(
      `Não foi possível gravar ${FILE} (${err instanceof Error ? err.message : err}). ` +
        'Em hospedagem serverless (ex.: Vercel) configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.',
    );
  }
}

const fileStore: Store = {
  async read() {
    try {
      return migrateMacros(JSON.parse(await fs.readFile(FILE, 'utf8')) as BoardState);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      const initial = createMockState(); // só quando o arquivo ainda não existe
      await writeFileState(initial);
      return initial;
    }
  },
  async saveBoard(next, user) {
    const current = await this.read();
    const saved = { ...mergeBoard(current, next), version: current.version + 1, updatedAt: new Date().toISOString(), updatedBy: user };
    await writeFileState(saved);
    return saved;
  },
  async replaceVehicles(vehicles, user) {
    const current = await this.read();
    const keep = new Set(vehicles.map((v) => v.id));
    const saved: BoardState = {
      ...current,
      vehicles: sortVehicles(vehicles),
      groups: current.groups.map((g) => ({ ...g, frotaIds: g.frotaIds.filter((id) => keep.has(id)) })),
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: user,
    };
    await writeFileState(saved);
    return saved;
  },
};
