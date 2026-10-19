/**
 * Regras de leitura da "Planilla de Programación" (Argentina).
 * Funções puras, usadas tanto pelo parser de texto quanto para normalizar o retorno da IA.
 *
 * Layout esperado (uma linha por caminhão):
 *   CONOCIMIENTO  EMISION  CAMION  SEMI-REMOLQUE  BRUTO  BULTOS  |D|C|A|  MANIFIESTO  T  VALOR FOT  PRODUCTO  ADELANTO  CLIENTE  DESTINO
 *   BR-135.057340 13/10/26 OLS-010.- MYZ-248.-   26249.00 13      | | | |  BR-135.139350 T 13867.34 CELULOSA 0.00   SOFTYS  ZARATE
 */
import type { Column, Section } from '@/lib/types';
import { normalizeText } from '@/lib/utils';

/** 1) "Planilla de Programacion N§ 388/2026" -> "388" (número antes da barra) */
export function programacaoFromHeader(text?: string | null): string {
  const t = String(text ?? '');
  const m =
    t.match(/Programaci[oó]n[^0-9]{0,12}?(\d{1,6})\s*\/\s*\d{2,4}/i) ?? // cabeçalho completo
    t.match(/^\s*(\d{1,6})\s*\/\s*\d{2,4}\s*$/); // só "388/2026"
  if (m) return String(Number(m[1]));
  const digits = t.replace(/\D/g, '');
  return digits && digits.length <= 6 ? String(Number(digits)) : '';
}

/**
 * 2) CONOCIMIENTO -> CRT: último grupo numérico, no máximo 6 dígitos, sem zeros à esquerda.
 *    "BR-135.057340" -> "57340"   ·   "BR-135.157340" -> "157340"   ·   "BR135057340" -> "57340"
 */
export function crtFromConocimiento(value?: string | null): string {
  const groups = String(value ?? '').match(/\d+/g);
  if (!groups) return '';
  const last = groups[groups.length - 1].slice(-6);
  return last.replace(/^0+(?=\d)/, '');
}

/** 3) Placa limpa para cruzamento: "OLS-010.-" -> "OLS010", "ah 434 ak" -> "AH434AK" */
export function cleanPlate(value?: string | null): string {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Parece uma placa? (letras e números, 5 a 8 caracteres depois de limpar) */
export function looksLikePlate(value?: string | null): boolean {
  const p = cleanPlate(value);
  return p.length >= 5 && p.length <= 8 && /[A-Z]/.test(p) && /\d/.test(p);
}

/** 5) Destino do PDF ("ZARATE") -> id da coluna do quadro ("zarate") */
export function destinoToColumnId(destino: string | null | undefined, columns: Column[], section: Section = 'exportacao'): string {
  const d = normalizeText(destino).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!d) return '';
  const norm = (c: Column) => normalizeText(c.title).replace(/\b(cl|ar|uy|br|py)\b/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const pool = [...columns.filter((c) => c.section === section), ...columns.filter((c) => c.section !== section)];
  return (
    pool.find((c) => norm(c) === d || c.id === d.replace(/ /g, '-'))?.id ??
    pool.find((c) => c.section === section && norm(c) && (d.includes(norm(c)) || norm(c).includes(d)))?.id ??
    ''
  );
}

export interface PlanillaRow {
  conocimiento: string;
  camion: string;
  semiRemolque: string;
  cliente: string;
  destino: string;
}

const CONOCIMIENTO_RE = /^[A-Z]{2}-?\d{2,4}\.?\d{4,8}$/i; // BR-135.057340
const NUMBER_RE = /^-?\d+(?:[.,]\d+)?$/;

/**
 * Parser determinístico do texto da planilla (PDF com camada de texto).
 * Ignora subtotais, cabeçalhos e anotações à mão.
 * `destinos` (nomes das colunas) ajuda a separar CLIENTE de DESTINO quando têm mais de uma palavra.
 */
export function parsePlanillaText(text: string, destinos: string[] = []): { programacao: string; rows: PlanillaRow[] } {
  const programacao = programacaoFromHeader(text);
  const knownDest = destinos.map((d) => normalizeText(d).replace(/\b(cl|ar|uy)\b/g, '').trim()).filter(Boolean);
  const rows: PlanillaRow[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const tokens = rawLine.replace(/\|/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (tokens.length < 6 || !CONOCIMIENTO_RE.test(tokens[0])) continue;

    // CAMION e SEMI-REMOLQUE: as duas primeiras "placas" depois da data de emissão
    let i = 1;
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(tokens[i] ?? '')) i++;
    const plates: string[] = [];
    for (; i < tokens.length && plates.length < 2; i++) {
      if (looksLikePlate(tokens[i])) plates.push(tokens[i]);
      else if (NUMBER_RE.test(tokens[i])) break; // chegou no BRUTO
    }

    // CLIENTE e DESTINO: tudo depois do último número (ADELANTO)
    let lastNum = -1;
    tokens.forEach((t, idx) => {
      if (NUMBER_RE.test(t)) lastNum = idx;
    });
    const tail = tokens.slice(lastNum + 1);
    let destino = '';
    let cliente = '';
    if (tail.length >= 2) {
      // tenta reconhecer destinos de várias palavras ("SANTIAGO CL") pelo nome das colunas
      let size = 1;
      for (let n = Math.min(3, tail.length - 1); n >= 1; n--) {
        const cand = normalizeText(tail.slice(-n).join(' ')).replace(/\b(cl|ar|uy)\b/g, '').trim();
        if (knownDest.includes(cand)) {
          size = n;
          break;
        }
      }
      destino = tail.slice(-size).join(' ');
      cliente = tail.slice(0, -size).join(' ');
    } else if (tail.length === 1) {
      destino = tail[0];
    }

    rows.push({ conocimiento: tokens[0], camion: plates[0] ?? '', semiRemolque: plates[1] ?? '', cliente, destino });
  }
  return { programacao, rows };
}

/** Texto da planilla 388/2026 (exemplo real) — usado no botão "Testar com PDF de exemplo" */
export const SAMPLE_PLANILLA_TEXT = `Atencion Sr:            Planilla de Programacion N§ 388/2026            13/10/26
CONOCIMIENTO  EMISION  CAMION  SEMI-REMOLQUE  BRUTO  BULTOS  |D|C|A|  MANIFIESTO N§:  VALOR FOT  PRODUCTO  ADELANTO
BR-135.057340 13/10/26 OLS-010.- MYZ-248.- 26249.00 13 | | | | BR-135.139350 T 13867.34 CELULOSA 0.00 SOFTYS ZARATE
BR-135.057340 13/10/26 FRT-619.- GKA-881.- 26225.00 13 | | | | BR-135.139351 T 13867.34 CELULOSA 0.00 SOFTYS ZARATE
BR-135.057340 13/10/26 NHP-003.- NMT-048.- 26245.00 13 | | | | BR-135.139352 T 13867.34 CELULOSA 0.00 SOFTYS ZARATE
BR-135.057340 13/10/26 FAI-289.- MYZ-238.- 26223.00 13 | | | | BR-135.139353 T 13867.34 CELULOSA 0.00 SOFTYS ZARATE
BR-135.057340 13/10/26 KLP-925.- OCS-652.- 26222.00 13 | | | | BR-135.139354 T 13867.34 CELULOSA 0.00 SOFTYS ZARATE
131164.00 65 69336.70 0.00
BR-135.057356 13/10/26 IXJ-839.- HWV-193.- 26178.00 13 | | | | BR-135.139473 T 13861.65 CELULOSA 0.00 SOFTYS ZARATE
BR-135.057356 13/10/26 AH434AK AF244DE 26176.00 13 | | | | BR-135.139474 T 13861.65 CELULOSA 0.00 SOFTYS ZARATE
BR-135.057356 13/10/26 FHC-735.- AE027IR 26227.00 13 | | | | BR-135.139475 T 13861.65 CELULOSA 0.00 SOFTYS ZARATE
BR-135.057356 13/10/26 MBN-687.- OJG-528.- 26208.00 13 | | | | BR-135.139476 T 13861.65 CELULOSA 0.00 SOFTYS ZARATE
BR-135.057356 13/10/26 KBG-674.- IBG-793.- 26203.00 13 | | | | BR-135.139477 T 13861.65 CELULOSA 0.00 SOFTYS ZARATE
BR-135.057356 13/10/26 GAK-1758.- DMB-8370.- 26232.00 13 | | | | BR-135.139478 T 13861.65 CELULOSA 0.00 SOFTYS ZARATE
157224.00 78 83169.90 0.00`;
