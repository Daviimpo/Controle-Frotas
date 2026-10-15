import { NextResponse } from 'next/server';
import { isBoardState, readState, writeState } from '@/lib/server/storage';
import { getSession } from '@/lib/server/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Leitura pública: qualquer pessoa com o link vê o quadro */
export async function GET() {
  const state = await readState();
  return NextResponse.json(state, { headers: { 'cache-control': 'no-store' } });
}

/** Escrita restrita: exige sessão de admin/operador */
export async function PUT(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!isBoardState(body)) return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });

  const current = await readState();
  const next = {
    ...body,
    version: (current.version ?? 0) + 1,
    updatedAt: new Date().toISOString(),
    updatedBy: session.user,
  };
  await writeState(next);
  return NextResponse.json(next);
}
