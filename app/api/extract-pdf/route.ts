import { NextResponse } from 'next/server';
import { getSession } from '@/lib/server/session';
import { readState } from '@/lib/server/storage';
import { extractWithClaude, simulateExtraction } from '@/lib/server/pdf-extract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 15 * 1024 * 1024;

export async function POST(req: Request) {
  if (!getSession()) return NextResponse.json({ error: 'Faça login para importar programações' }, { status: 401 });

  const form = await req.formData();
  const file = form.get('file');
  const demo = form.get('demo') === '1';
  const state = await readState();

  if (demo || !(file instanceof File)) {
    return NextResponse.json(simulateExtraction(state));
  }
  if (file.type && file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Envie um arquivo PDF' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'PDF maior que 15 MB' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      ...simulateExtraction(state, file.name),
      warning: 'ANTHROPIC_API_KEY não configurada no servidor — exibindo extração simulada.',
    });
  }

  try {
    return NextResponse.json(await extractWithClaude(file, apiKey));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      ...simulateExtraction(state, file.name),
      warning: `Falha na leitura via IA (${message}). Exibindo extração simulada.`,
    });
  }
}
