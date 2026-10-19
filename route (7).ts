import { getStore, readState } from '@/lib/server/storage';
import { getSession } from '@/lib/server/session';
import { errorResponse, json } from '@/lib/server/http';
import { applyAllocations, type Allocation } from '@/lib/board-ops';
import { MACROS } from '@/lib/macro';
import { SEM_PROGRAMACAO } from '@/lib/mock-data';
import { crtFromConocimiento, destinoToColumnId, programacaoFromHeader } from '@/lib/pdf/planilla';
import type { BoardState, Column, Macro } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Payload aceito: { allocations: [{ vehicleId, columnId, programacao, crt, cliente, destino? }], macro } */
interface AllocationInput {
  vehicleId?: unknown;
  columnId?: unknown;
  programacao?: unknown;
  crt?: unknown;
  cliente?: unknown;
  destino?: unknown;
}

const text = (v: unknown) => String(v ?? '').trim();

/**
 * Garante um id que EXISTE em quadro_colunas (evita violação de FK em quadro_frotas.coluna_id).
 * Aceita o id da coluna ("cordoba"), o nome do destino ("CORDOBA", "Córdoba")
 * ou o formato combinado "CLIENTE / DESTINO" ("VITOPEL / CORDOBA").
 */
function resolveColumn(a: AllocationInput, state: BoardState): { columnId: string; cliente: string } | null {
  const valid = new Map<string, Column>(state.columns.map((c) => [c.id, c]));
  const usable = (id: string) => !!id && id !== SEM_PROGRAMACAO && valid.has(id);

  let cliente = text(a.cliente);
  const [clientePart, destinoPart] = cliente.includes('/') ? cliente.split('/').map((s) => s.trim()) : [cliente, ''];

  const candidates = [text(a.columnId), text(a.destino), destinoPart];
  for (const c of candidates) {
    const id = usable(c) ? c : destinoToColumnId(c, state.columns, 'exportacao');
    if (usable(id)) {
      // "VITOPEL / CORDOBA" -> cliente "VITOPEL" quando o destino veio desse campo
      if (destinoPart && c === destinoPart) cliente = clientePart;
      return { columnId: id, cliente };
    }
  }
  return null;
}

/**
 * Confirmação da importação do PDF.
 * 1. lê o estado atual (readState)
 * 2. agrupa por Programação + CRT, move as frotas e atualiza a macro (applyAllocations, função pura)
 * 3. grava EXCLUSIVAMENTE via getStore().saveBoard()
 */
export async function POST(req: Request) {
  const session = getSession();
  if (!session) return json({ error: 'Não autorizado' }, 401);

  const body = (await req.json().catch(() => null)) as { allocations?: AllocationInput[]; macro?: unknown } | null;
  if (!Array.isArray(body?.allocations) || body.allocations.length === 0) {
    return json({ error: 'Nenhuma frota para alocar.' }, 400);
  }
  const macroKey = text(body.macro).toLowerCase();
  const macro = macroKey in MACROS ? (macroKey as Macro) : undefined;

  try {
    const current = await readState();
    const vehicleIds = new Set(current.vehicles.map((v) => v.id));

    const allocations: Allocation[] = [];
    const problems: string[] = [];
    const seen = new Set<string>();

    body.allocations.forEach((a, i) => {
      const vehicleId = text(a.vehicleId);
      if (!vehicleIds.has(vehicleId)) return void problems.push(`linha ${i + 1}: frota "${vehicleId}" não existe no cadastro`);
      if (seen.has(vehicleId)) return; // mesma frota repetida: vale a primeira linha
      const col = resolveColumn(a, current);
      if (!col) {
        return void problems.push(
          `linha ${i + 1}: destino "${text(a.destino) || text(a.cliente).split('/').pop()?.trim() || text(a.columnId)}" não corresponde a nenhuma coluna do quadro (cadastre o destino no Quadro de Frotas)`,
        );
      }
      seen.add(vehicleId);
      allocations.push({
        vehicleId,
        columnId: col.columnId,
        programacao: programacaoFromHeader(text(a.programacao)) || undefined,
        crt: crtFromConocimiento(text(a.crt)) || undefined,
        cliente: col.cliente || undefined,
      });
    });

    if (problems.length) {
      return json({ error: `Importação não salva — ${problems.join('; ')}.` }, 400);
    }

    // Estado completo (BoardState) com colunas intactas; blocos novos/atualizados e macros.
    const next = applyAllocations(current, allocations, macro);
    const state = await getStore().saveBoard(next, session.user);

    const blocos = new Set(allocations.map((a) => `${a.programacao ?? ''}|${a.crt ?? ''}`)).size;
    return json({ state, frotas: allocations.length, blocos });
  } catch (err) {
    return errorResponse(err);
  }
}
