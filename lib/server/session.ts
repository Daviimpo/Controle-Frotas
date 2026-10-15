import 'server-only';
import crypto from 'crypto';
import { cookies } from 'next/headers';
import type { Role, Session } from '@/lib/types';

export const SESSION_COOKIE = 'polivias_session';
export const SESSION_HOURS = 12;

const SECRET = process.env.SESSION_SECRET || 'polivias-dev-secret-troque-em-producao';

interface Payload extends Session {
  exp: number;
}

function hmac(data: string) {
  return crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
}

export function signSession(session: Session) {
  const payload: Payload = { ...session, exp: Date.now() + SESSION_HOURS * 3_600_000 };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${hmac(body)}`;
}

export function verifySession(token?: string | null): Session | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = hmac(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Payload;
    if (p.exp < Date.now()) return null;
    return { user: p.user, role: p.role };
  } catch {
    return null;
  }
}

export function getSession(): Session | null {
  return verifySession(cookies().get(SESSION_COOKIE)?.value);
}

/** POLIVIAS_USERS="admin:senha:admin,operador:senha:operador" */
function users(): { user: string; password: string; role: Role }[] {
  const raw = process.env.POLIVIAS_USERS || 'admin:polivias@2026:admin,operador:operador@2026:operador';
  return raw
    .split(',')
    .map((entry) => entry.trim().split(':'))
    .filter((p) => p.length >= 2)
    .map(([user, password, role]) => ({ user, password, role: role === 'operador' ? 'operador' : 'admin' }));
}

export function checkCredentials(user: string, password: string): Session | null {
  const found = users().find((u) => u.user.toLowerCase() === user.trim().toLowerCase());
  if (!found) return null;
  const a = Buffer.from(found.password);
  const b = Buffer.from(password);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { user: found.user, role: found.role };
}
