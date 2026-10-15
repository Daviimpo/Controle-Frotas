import 'server-only';
import fs from 'fs/promises';
import path from 'path';
import type { BoardState } from '@/lib/types';
import { createMockState } from '@/lib/mock-data';

/**
 * Persistência simples em arquivo JSON (ideal para servidor próprio / VPS).
 * Para Vercel/serverless, troque estas duas funções por Supabase, Postgres, Redis etc.
 * Se o disco for somente-leitura, o estado fica em memória.
 */
const FILE = path.resolve(process.env.DATA_FILE || path.join(process.cwd(), 'data', 'state.json'));

const g = globalThis as unknown as { __poliviasState?: BoardState };

export async function readState(): Promise<BoardState> {
  try {
    const raw = await fs.readFile(FILE, 'utf8');
    const parsed = JSON.parse(raw) as BoardState;
    g.__poliviasState = parsed;
    return parsed;
  } catch {
    if (g.__poliviasState) return g.__poliviasState;
    const initial = createMockState();
    await writeState(initial);
    return initial;
  }
}

export async function writeState(state: BoardState) {
  g.__poliviasState = state;
  try {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
    await fs.rename(tmp, FILE);
  } catch (err) {
    console.warn('[polivias] não foi possível gravar o arquivo de estado, mantendo em memória:', err);
  }
}

export function isBoardState(x: unknown): x is BoardState {
  const s = x as BoardState;
  return !!s && Array.isArray(s.vehicles) && Array.isArray(s.columns) && Array.isArray(s.groups);
}
