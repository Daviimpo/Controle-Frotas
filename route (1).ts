import { NextResponse } from 'next/server';
import { getSession } from '@/lib/server/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ session: getSession() }, { headers: { 'cache-control': 'no-store' } });
}
