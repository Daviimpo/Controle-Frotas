import 'server-only';
import type { BoardState, ExtractionResult, ExtractedRow, Vehicle } from '@/lib/types';
import {
  cleanPlate,
  crtFromConocimiento,
  destinoToColumnId,
  parsePlanillaText,
  programacaoFromHeader,
  SAMPLE_PLANILLA_TEXT,
  type PlanillaRow,
} from '@/lib/pdf/planilla';

// ---------------------------------------------------------------------------
// 1) Camada de texto do PDF (planilla gerada pelo sistema) — sem custo de IA
// ---------------------------------------------------------------------------
export async function extractPdfText(data: Uint8Array): Promise<string> {
  const { getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(data);
  const lines: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // reagrupa os fragmentos por linha (mesma coordenada Y) e ordena da esquerda para a direita
    const byLine: { y: number; items: { x: number; s: string }[] }[] = [];
    for (const it of content.items as { str?: string; transform?: number[] }[]) {
      if (!it.str?.trim() || !it.transform) continue;
      const x = it.transform[4];
      const y = it.transform[5];
      let line = byLine.find((l) => Math.abs(l.y - y) < 3);
      if (!line) byLine.push((line = { y, items: [] }));
      line.items.push({ x, s: it.str });
    }
    byLine
      .sort((a, b) => b.y - a.y)
      .forEach((l) => lines.push(l.items.sort((a, b) => a.x - b.x).map((i) => i.s).join(' ')));
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 2) PDF digitalizado (imagem, com anotações à mão) — leitura por Claude
// ---------------------------------------------------------------------------
const PROMPT = `Você vai ler uma "Planilla de Programación" de transporte (Argentina), possivelmente digitalizada e com anotações à mão.

A tabela tem as colunas, nesta ordem:
CONOCIMIENTO | EMISION | CAMION | SEMI-REMOLQUE | BRUTO | BULTOS | |D|C|A| | MANIFIESTO N§ | T | VALOR FOT | PRODUCTO | ADELANTO | (CLIENTE) | (DESTINO)
As duas últimas colunas não têm título: a penúltima é o CLIENTE (ex.: SOFTYS) e a última é o DESTINO (ex.: ZARATE).

Extraia:
- "cabecalho": o texto exato depois de "Planilla de Programacion N§" (ex.: "388/2026").
- Para CADA linha de caminhão (linhas que começam com o CONOCIMIENTO, ex.: "BR-135.057340"):
  conocimiento, camion, semi_remolque, cliente, destino — copiados exatamente como impressos.

Ignore: anotações manuscritas (números de telefone, "CMPC/SOFTYS", "TPG-3", riscos), linhas de subtotal, cabeçalhos repetidos.
Não invente valores; use null quando não for legível.

Responda SOMENTE com JSON válido:
{"cabecalho":"388/2026","rows":[{"conocimiento":"BR-135.057340","camion":"OLS-010.-","semi_remolque":"MYZ-248.-","cliente":"SOFTYS","destino":"ZARATE"}]}`;

export async function extractWithClaude(data: Uint8Array, apiKey: string): Promise<{ programacao: string; rows: PlanillaRow[] }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
      max_tokens: 4096,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from(data).toString('base64') } },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`API Anthropic ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);

  const json = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = (json.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n');
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Resposta da IA sem JSON reconhecível');
  const parsed = JSON.parse(match[0]) as {
    cabecalho?: string | null;
    rows?: { conocimiento?: string | null; camion?: string | null; semi_remolque?: string | null; cliente?: string | null; destino?: string | null }[];
  };
  return {
    programacao: programacaoFromHeader(parsed.cabecalho),
    rows: (parsed.rows ?? [])
      .filter((r) => r && (r.camion || r.semi_remolque))
      .map((r) => ({
        conocimiento: String(r.conocimiento ?? ''),
        camion: String(r.camion ?? ''),
        semiRemolque: String(r.semi_remolque ?? ''),
        cliente: String(r.cliente ?? '').trim(),
        destino: String(r.destino ?? '').trim(),
      })),
  };
}

// ---------------------------------------------------------------------------
// 3) Regras + cruzamento com a tabela `frotas` (mesmo código para texto e IA)
// ---------------------------------------------------------------------------
export function buildExtraction(
  parsed: { programacao: string; rows: PlanillaRow[] },
  state: BoardState,
  source: ExtractionResult['source'],
  documento: string,
): ExtractionResult {
  const byPlate = new Map<string, { v: Vehicle; by: 'cavalo' | 'carreta' }>();
  for (const v of state.vehicles) {
    const c = cleanPlate(v.placaCavalo);
    const k = cleanPlate(v.placaCarreta);
    if (k && !byPlate.has(k)) byPlate.set(k, { v, by: 'carreta' });
    if (c) byPlate.set(c, { v, by: 'cavalo' }); // cavalo tem prioridade
  }

  const rows: ExtractedRow[] = parsed.rows.map((r) => {
    // CAMION tem prioridade; SEMI-REMOLQUE é usado quando o cavalo não está no cadastro
    const byCamion = cleanPlate(r.camion) ? byPlate.get(cleanPlate(r.camion)) : undefined;
    const bySemi = cleanPlate(r.semiRemolque) ? byPlate.get(cleanPlate(r.semiRemolque)) : undefined;
    const hit = byCamion ?? bySemi;
    return {
      conocimiento: r.conocimiento,
      placaCavalo: cleanPlate(r.camion),
      placaCarreta: cleanPlate(r.semiRemolque),
      crt: crtFromConocimiento(r.conocimiento),
      programacao: parsed.programacao,
      cliente: r.cliente,
      destino: r.destino,
      vehicleId: hit?.v.id ?? null,
      frota: hit?.v.frota ?? null,
      matchedBy: byCamion ? 'cavalo' : bySemi ? 'carreta' : null,
      columnId: destinoToColumnId(r.destino, state.columns, 'exportacao') || null,
    };
  });

  return { source, documento, tipo: 'exportacao', pais: 'AR', programacao: parsed.programacao, rows };
}

export function sampleExtraction(state: BoardState): ExtractionResult {
  const parsed = parsePlanillaText(SAMPLE_PLANILLA_TEXT, state.columns.map((c) => c.title));
  return buildExtraction(parsed, state, 'exemplo', 'Planilla de Programación Nº 388/2026 (exemplo)');
}
