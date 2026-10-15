import { getStore } from '@/lib/server/storage';
import { getSession } from '@/lib/server/session';
import { errorResponse, json } from '@/lib/server/http';
import { applyAllocations, type Allocation } from '@/lib/board-ops';
import { MACROS } from '@/lib/macro';
import { crtFromConocimiento, programacaoFromHeader } from '@/lib/pdf/planilla';
import type { Macro } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Confirmação da importação do PDF:
 * cria/atualiza o bloco Programação + CRT em `quadro_frotas`, move as frotas vinculadas
 * para ele e atualiza a macro delas em `frotas`.
 */
export async function POST(req: Request) {
  const session = getSession();
  if (!session) return json({ error: 'Não autorizado' }, 401);

  const body = (await req.json().catch(() => null)) as { allocations?: Partial<Allocation>[]; macro?: string } | null;
  const macro = body?.macro && body.macro in MACROS ? (body.macro as Macro) : undefined;
  if (!Array.isArray(body?.allocations) || !body!.allocations.length) return json({ error: 'Nenhuma frota para alocar.' }, 400);

  try {
    const store = getStore();
    const current = await store.read();
    const vehicles = new Set(current.vehicles.map((v) => v.id));
    const columns = new Set(current.columns.map((c) => c.id));

    const seen = new Set<string>();
    const allocations: Allocation[] = [];
    for (const a of body!.allocations) {
      const vehicleId = String(a.vehicleId ?? '');
      const columnId = String(a.columnId ?? '');
      if (!vehicles.has(vehicleId)) return json({ error: `Frota ${vehicleId} não existe mais no cadastro. Recarregue a página.` }, 409);
      if (!columns.has(columnId)) return json({ error: `Destino "${columnId}" não existe no quadro.` }, 400);
      if (seen.has(vehicleId)) continue; // a mesma frota em duas linhas: vale a primeira
      seen.add(vehicleId);
      allocations.push({
        vehicleId,
        columnId,
        programacao: programacaoFromHeader(String(a.programacao ?? '')) || undefined,
        crt: crtFromConocimiento(String(a.crt ?? '')) || undefined,
        cliente: String(a.cliente ?? '').trim() || undefined,
      });
    }

    const next = applyAllocations(current, allocations, macro);
    const state = await store.saveBoard(next, session.user);
    const blocos = new Set(allocations.map((a) => `${a.programacao}|${a.crt}`)).size;
    return json({ state, frotas: allocations.length, blocos });
  } catch (err) {
    return errorResponse(err);
  }
}
