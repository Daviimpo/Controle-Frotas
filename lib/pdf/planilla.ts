import { createClient } from '@supabase/supabase-js';

export interface PlanillaRow {
  programacao: string;
  crt: string;
  conocimientoOriginal: string;
  placaCavalo: string;
  placaCarreta: string;
  cliente: string;
  destino: string;
  frotaEncontrada?: string;
  matchedBy?: 'cavalo' | 'carreta';
  // Campos legados para compatibilidade com lib/server/pdf-extract.ts
  conocimiento?: string;
  camion?: string;
  semiRemolque?: string;
}

export interface PlanillaGroup {
  programacao: string;
  crt: string;
  cliente: string;
  destino: string;
  columnId: string;
  frotas: Array<{
    frota: string;
    placaCavalo: string;
    placaCarreta: string;
    matchedBy: 'cavalo' | 'carreta';
  }>;
}

export const SAMPLE_PLANILLA_TEXT = `Atencion Sr: Planilla de Programacion N§ 388/2026 13/10/26
CONOCIMIENTO EMISION CAMION SEMI-REMOLQUE BRUTO BULTOS |D|C|A| MANIFIESTO N§: VALOR FOT PRODUCTO ADELANTO
BR-135.057340 13/10/26 OLS-010.- MYZ-248.- 26249.00 13 | | | | BR-135.139350 T 13867.34 CELULOSA 0.00 SOFTYS ZARATE
BR-135.057340 13/10/26 FRT-619.- GKA-881.- 26225.00 13 | | | | BR-135.139351 T 13867.34 CELULOSA 0.00 SOFTYS ZARATE
BR-135.057356 13/10/26 IXJ-839.- HWV-193.- 26178.00 13 | | | | BR-135.139473 T 13861.65 CELULOSA 0.00 SOFTYS ZARATE`;

export function cleanPlate(plate?: string | null): string {
  if (!plate) return '';
  return plate.replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

export function programacaoFromHeader(text?: string | null): string {
  if (!text) return '';
  const match = text.match(/Planilla\s+de\s+Programacion\s+N[§\d]*\s+(\d+)\/(\d+)/i);
  return match ? match[1] : '';
}

export function crtFromConocimiento(conocimiento?: string | null): string {
  if (!conocimiento) return '';
  const clean = conocimiento.replace('BR-135.', '').trim();
  return clean.replace(/^0+/, '') || clean;
}

export function destinoToColumnId(destinoRaw?: string | null, columns?: any[], tipo?: string): string {
  const d = (destinoRaw || '').toUpperCase().trim();
  if (d.includes('ZARATE')) return 'zarate';
  if (d.includes('BUENOS AIRES') || d.includes('BS AS') || d.includes('CABA')) return 'buenos-aires';
  if (d.includes('CORDOBA')) return 'cordoba';
  if (d.includes('ROSARIO')) return 'rosario';
  if (d.includes('PILAR')) return 'pilar';
  if (d.includes('SANTIAGO')) return 'santiago';
  if (d.includes('MENDOZA')) return 'mendoza';
  return 'zarate';
}

export function parsePlanillaText(txtContent: string, knownColumns?: string[]): { programacao: string; rows: PlanillaRow[] } {
  const lines = txtContent.split('\n');
  let programacao = programacaoFromHeader(txtContent);

  const rows: PlanillaRow[] = [];

  for (const line of lines) {
    if (
      !line.includes('BR-135.') || 
      line.includes('CONOCIMIENTO') || 
      line.trim().startsWith('---') || 
      line.trim().startsWith('___')
    ) {
      continue;
    }

    const crtMatch = line.match(/(BR-135\.\d+)/);
    if (!crtMatch) continue;

    const conocimientoOriginal = crtMatch[1];
    const crtDigits = crtFromConocimiento(conocimientoOriginal);

    const plateMatches = line.match(/([A-Z0-9]{3,4}[-\s]?[A-Z0-9]{3,4}\.-?)/gi);
    const placaCavalo = plateMatches && plateMatches[0] ? cleanPlate(plateMatches[0]) : '';
    const placaCarreta = plateMatches && plateMatches[1] ? cleanPlate(plateMatches[1]) : '';

    const endMatch = line.trim().match(/([A-Z0-9\s]+)\s+([A-Z\s]+)$/i);
    let cliente = 'SOFTYS';
    let destino = 'ZARATE';

    if (endMatch) {
      const parts = endMatch[0].trim().split(/\s+/);
      if (parts.length >= 2) {
        destino = parts.pop() || 'ZARATE';
        cliente = parts.join(' ');
      }
    }

    rows.push({
      programacao,
      crt: crtDigits,
      conocimientoOriginal,
      placaCavalo,
      placaCarreta,
      cliente,
      destino,
      conocimiento: conocimientoOriginal,
      camion: placaCavalo,
      semiRemolque: placaCarreta,
    });
  }

  return { programacao, rows };
}

export function parseTxtPlanilla(txtContent: string): PlanillaRow[] {
  const result = parsePlanillaText(txtContent);
  return result.rows;
}
