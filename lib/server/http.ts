import 'server-only';
import { NextResponse } from 'next/server';

export function errorResponse(err: unknown, status = 500) {
  const message = err instanceof Error ? err.message : String(err);
  console.error('[polivias]', message);
  return NextResponse.json({ error: message }, { status });
}

export const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { 'cache-control': 'no-store' } });
