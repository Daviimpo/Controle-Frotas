import { getSession } from '@/lib/server/session';
import { readState } from '@/lib/server/storage';
import { buildExtraction, extractPdfText, extractWithClaude, sampleExtraction } from '@/lib/server/pdf-extract';
import { parsePlanillaText } from '@/lib/pdf/planilla';
import { errorResponse, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Lê a Planilla de Programación e cruza as placas com a tabela `frotas`.
 * Ordem: camada de texto do PDF (parser determinístico) -> Claude (PDF digitalizado).
 * Nada é gravado aqui; a gravação acontece em /api/pdf/confirm.
 */
export async function POST(req: Request) {
  if (!getSession()) return json({ error: 'Faça login para importar programações' }, 401);

  try {
    const form = await req.formData();
    const file = form.get('file');
    const state = await readState(); // Supabase: frotas + quadro atualizados

    if (form.get('demo') === '1') return json(sampleExtraction(state));
    if (!(file instanceof File)) return json({ error: 'Envie um arquivo PDF' }, 400);
    if (file.size > MAX_BYTES) return json({ error: 'PDF maior que 15 MB' }, 400);

    const data = new Uint8Array(await file.arrayBuffer());
    if (String.fromCharCode(...data.slice(0, 5)) !== '%PDF-') return json({ error: 'O arquivo enviado não é um PDF válido' }, 400);

    // 1) PDF com texto
    let textError = '';
    try {
      const text = await extractPdfText(data);
      const parsed = parsePlanillaText(text, state.columns.map((c) => c.title));
      if (parsed.rows.length) return json(buildExtraction(parsed, state, 'texto', file.name));
    } catch (err) {
      textError = err instanceof Error ? err.message : String(err);
    }

    // 2) PDF digitalizado -> IA
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return json(
        {
          error:
            'Este PDF não tem texto selecionável (parece digitalizado). Configure ANTHROPIC_API_KEY no servidor para a leitura por IA.' +
            (textError ? ` Detalhe: ${textError}` : ''),
        },
        422,
      );
    }
    const parsed = await extractWithClaude(data, apiKey);
    if (!parsed.rows.length) return json({ error: 'Nenhuma linha de caminhão encontrada na planilla.' }, 422);
    return json(buildExtraction(parsed, state, 'claude', file.name));
  } catch (err) {
    return errorResponse(err);
  }
}
