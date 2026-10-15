import { getStore, isBoardState } from '@/lib/server/storage';
import { getSession } from '@/lib/server/session';
import { errorResponse, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Leitura pública: qualquer pessoa com o link vê o quadro (sempre direto do banco) */
export async function GET() {
  try {
    return json(await getStore().read());
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Salva o quadro (colunas, blocos de quadro_frotas e macros). Exige login.
 * Inserir/excluir frotas do cadastro é feito em /api/frotas e /api/frotas/import.
 */
export async function PUT(req: Request) {
  const session = getSession();
  if (!session) return json({ error: 'Não autorizado' }, 401);

  const body = await req.json().catch(() => null);
  if (!isBoardState(body)) return json({ error: 'Estado inválido' }, 400);

  try {
    const store = getStore();
    const current = await store.read();
    // Aba desatualizada (outro usuário salvou depois que ela carregou): não sobrescreve
    if (typeof body.version === 'number' && body.version < current.version) {
      return json({ error: 'O quadro foi alterado por outro usuário. Recarregamos a versão mais recente.', state: current }, 409);
    }
    return json(await store.saveBoard(body, session.user));
  } catch (err) {
    return errorResponse(err);
  }
}
