import { getStore } from '@/lib/server/storage';
import { getSession } from '@/lib/server/session';
import { errorResponse, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Exclusão em massa: remove da tabela `frotas` (e o trigger as retira de `quadro_frotas`) */
export async function DELETE(req: Request) {
  const session = getSession();
  if (!session) return json({ error: 'Não autorizado' }, 401);

  const body = (await req.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? Array.from(new Set(body!.ids.map(String))) : [];
  if (!ids.length) return json({ error: 'Nenhuma frota selecionada.' }, 400);

  try {
    const store = getStore();
    const current = await store.read();
    const drop = new Set(ids);
    const remaining = current.vehicles.filter((v) => !drop.has(v.id));
    const removed = current.vehicles.length - remaining.length;
    const state = await store.replaceVehicles(remaining, session.user);
    return json({ state, removed });
  } catch (err) {
    return errorResponse(err);
  }
}
