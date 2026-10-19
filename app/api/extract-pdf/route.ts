import { readState } from '@/lib/server/storage';
import { buildExtraction, extractPdfText, extractWithClaude, sampleExtraction } from '@/lib/server/pdf-extract';
import { parsePlanillaText } from '@/lib/pdf/planilla';
import { errorResponse, json } from '@/lib/server/http';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const state = await readState();
    const formData = await req.formData();
    const isDemo = formData.get('demo') === '1';

    if (isDemo) {
      return json(sampleExtraction(state));
    }

    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      return errorResponse('Nenhum arquivo enviado.', 400);
    }

    const fileName = file.name.toLowerCase();
    const isTxt = fileName.endsWith('.txt') || file.type === 'text/plain';

    // 1. Processamento de arquivo TXT
    if (isTxt) {
      const textContent = await file.text();
      const parsed = parsePlanillaText(textContent, state.columns.map((c) => c.title));
      if (parsed.rows.length) {
        return json(buildExtraction(parsed, state, 'texto', file.name));
      }
      return errorResponse('Não foi possível extrair dados válidos do arquivo TXT.', 400);
    }

    // 2. Processamento de arquivo PDF
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let textError = '';
    try {
      const text = await extractPdfText(buffer);
      const parsed = parsePlanillaText(text, state.columns.map((c) => c.title));
      if (parsed.rows.length) {
        return json(buildExtraction(parsed, state, 'texto', file.name));
      }
    } catch (err) {
      textError = err instanceof Error ? err.message : String(err);
    }

    // 3. Fallback para Claude (IA) caso o PDF seja imagem/scan
    try {
      const parsed = await extractWithClaude(buffer, file.type || 'application/pdf');
      if (parsed.rows.length) {
        return json(buildExtraction(parsed, state, 'claude', file.name));
      }
    } catch (err) {
      const claudeErr = err instanceof Error ? err.message : String(err);
      return errorResponse(
        `Não foi possível ler o PDF: ${textError || 'sem texto selecionável'}. IA: ${claudeErr}`,
        422,
      );
    }

    return errorResponse('Não foram encontradas linhas de programação válidas no arquivo.', 422);
  } catch (err) {
    return errorResponse(
      `Erro ao processar o arquivo: ${err instanceof Error ? err.message : String(err)}`,
      500,
    );
  }
}
