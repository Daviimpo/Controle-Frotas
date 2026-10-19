import { getStore } from '@/lib/server/storage';
import { getSession } from '@/lib/server/session';
import { errorResponse, json } from '@/lib/server/http';
import { upsertVehicles } from '@/lib/board-ops';
import type { VehicleInput } from '@/lib/types';
import { formatPlate } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Importação da planilha base: grava direto na tabela `frotas` */
export async function POST(req: Request) {
  const session = getSession();
  if (!session) return json({ error: 'Não autorizado' }, 401);

  const body = (await req.json().catch(() => null)) as { rows?: unknown; mode?: unknown } | null;
  const mode = body?.mode === 'replace' ? 'replace' : 'merge';
  if (!Array.isArray(body?.rows) || body!.rows.length === 0 || body!.rows.length > 5000) {
    return json({ error: 'Envie entre 1 e 5000 linhas.' }, 400);
  }

  const seen = new Set<string>();
  const rows: VehicleInput[] = [];
  for (const r of body!.rows as Record<string, unknown>[]) {
    const frota = String(r?.frota ?? '').trim();
    if (!frota || seen.has(frota)) continue;
    seen.add(frota);
    rows.push({
      frota,
      placaCavalo: formatPlate(String(r.placaCavalo ?? '')),
      placaCarreta: formatPlate(String(r.placaCarreta ?? '')),
      motorista: String(r.motorista ?? '').trim(),
    });
  }
  if (!rows.length) return json({ error: 'Nenhuma linha com número de frota.' }, 400);

  try {
    const store = getStore();
    const current = await store.read();
    const r = upsertVehicles(current, rows, mode);
    const state = await store.replaceVehicles(r.state.vehicles, session.user);
    return json({ state, added: r.added, updated: r.updated, removed: r.removed });
  } catch (err) {
    return errorResponse(err);
  }
}
