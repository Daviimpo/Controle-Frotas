import 'server-only';
import type { BoardState, ExtractionResult } from '@/lib/types';
import { unassignedVehicles } from '@/lib/board-ops';

const PROMPT = `Você é um assistente de operação logística da Polivias Transportes (transporte rodoviário internacional Brasil / Argentina / Uruguai / Chile).
Leia a "Planilla de Programación" anexada e extraia CADA caminhão programado.

Responda SOMENTE com um JSON válido, sem texto antes ou depois, no formato:
{
  "documento": "título ou identificação do documento",
  "tipo": "exportacao" | "importacao",
  "pais": "AR" | "UY" | "CL" | "PY" | null,
  "programacao": "número da programação geral ou null",
  "rows": [
    {
      "placaCavalo": "placa do caminhão / camión / tractor / chasis",
      "placaCarreta": "placa do semirreboque / acoplado / carreta ou null",
      "motorista": "nome do motorista / chofer ou null",
      "crt": "número COMPLETO do CRT / Conhecimento / Carta de Porte",
      "programacao": "número da programação desta linha",
      "destino": "cidade de destino (ex: Buenos Aires, Rosario, Pilar, Córdoba, Zárate, Santiago)",
      "cliente": "cliente / importador / exportador ou null"
    }
  ]
}

Regras:
- Copie as placas exatamente como aparecem no documento.
- Não invente dados; use null quando a informação não existir.
- "tipo" = "exportacao" quando a carga sai do Brasil para o exterior; "importacao" quando vem para o Brasil.`;

export async function extractWithClaude(file: File, apiKey: string): Promise<ExtractionResult> {
  const data = Buffer.from(await file.arrayBuffer()).toString('base64');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`API Anthropic ${res.status}: ${detail.slice(0, 200)}`);
  }

  const json = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = (json.content ?? [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('\n');
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Resposta da IA sem JSON reconhecível');
  const parsed = JSON.parse(match[0]) as Omit<ExtractionResult, 'source'>;

  return {
    source: 'claude',
    documento: parsed.documento ?? file.name,
    tipo: parsed.tipo ?? null,
    pais: parsed.pais ?? null,
    programacao: parsed.programacao ?? null,
    rows: (parsed.rows ?? []).filter((r) => r && r.placaCavalo),
  };
}

/** Extração simulada — usa frotas reais do cadastro para demonstrar o cruzamento de placas */
export function simulateExtraction(state: BoardState, fileName?: string): ExtractionResult {
  const pool = unassignedVehicles(state);
  const source = pool.length >= 4 ? pool : state.vehicles;
  const pick = source.slice(0, 4);
  const [a, b, c, d] = pick;

  const rows: ExtractionResult['rows'] = [];
  if (a) rows.push({ placaCavalo: a.placaCavalo, placaCarreta: a.placaCarreta, motorista: a.motorista, crt: 'BR471.00.057460', programacao: '392', destino: 'Rosario', cliente: 'Papelera del Litoral S.A.' });
  if (b) rows.push({ placaCavalo: b.placaCavalo.replace('-', ' '), placaCarreta: b.placaCarreta, motorista: b.motorista, crt: 'BR471.00.057460', programacao: '392', destino: 'Rosario', cliente: 'Papelera del Litoral S.A.' });
  // linha onde só a carreta (acoplado) é reconhecida
  if (c) rows.push({ placaCavalo: 'AF 482 KD', placaCarreta: c.placaCarreta, motorista: c.motorista, crt: '0047-1BR057460', programacao: '392', destino: 'Rosario', cliente: 'Papelera del Litoral S.A.' });
  if (d) rows.push({ placaCavalo: d.placaCavalo, placaCarreta: d.placaCarreta, motorista: d.motorista, crt: 'BR471.00.057488', programacao: '393', destino: 'Córdoba', cliente: 'Celulosa Mediterránea S.A.' });
  // placa não cadastrada
  rows.push({ placaCavalo: 'AE 123 XK', placaCarreta: 'AB 991 TT', motorista: 'Ramón Gutiérrez', crt: 'BR471.00.057488', programacao: '393', destino: 'Córdoba', cliente: 'Celulosa Mediterránea S.A.' });

  return {
    source: 'simulacao',
    documento: fileName ?? 'Planilla de Programación - Argentina (exemplo)',
    tipo: 'exportacao',
    pais: 'AR',
    programacao: '392 / 393',
    rows,
  };
}
