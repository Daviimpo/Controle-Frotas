import { NextResponse } from 'next/server';
import { checkCredentials, SESSION_COOKIE, SESSION_HOURS, signSession } from '@/lib/server/session';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const { username, password } = (await req.json().catch(() => ({}))) as { username?: string; password?: string };
  const session = checkCredentials(username ?? '', password ?? '');
  if (!session) return NextResponse.json({ error: 'Usuário ou senha inválidos' }, { status: 401 });

  const res = NextResponse.json({ session });
  res.cookies.set(SESSION_COOKIE, signSession(session), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_HOURS * 3600,
  });
  return res;
}
