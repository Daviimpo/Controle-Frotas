import { createClient } from '@supabase/supabase-js';

export interface PlanillaRow {
  programacao?: string;
  crt?: string;
  conocimientoOriginal?: string;
  placaCavalo?: string;
  placaCarreta?: string;
  cliente?: string;
  destino?: string;
  clienteDestino?: string;
  frotaEncontrada?: string;
  matchedBy?: 'cavalo' | 'carreta';
  columnId?: string;
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
BR-135.057340 13/10/26 OLS-010.- MYZ-248.- 26249.00 13 | | | | BR-135.139350 T 13867.34 CELULOSA 0.00 SOFTYS ZARATE`;

export function cleanPlate(plate?: string | null): string {
  if (!plate) return '';
  return plate.replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

export function programacaoFromHeader(text?: string | null): string {
  if (!text) return '';
  const match = text.match(/Planilla\s+de\s+Programacion[^\d]*(\d+)\s*\/\s*\d+/i);
  return match ? match[1] : '';
}

export function crtFromConocimiento(conocimiento?: string | null): string {
  if (!conocimiento) return '';
  const clean = conocimiento.replace('BR-135.', '').trim();
  return clean.replace(/^0+/, '') || clean;
}

export function destinoToColumnId(destinoRaw?: string | null, columns?: any[], tipo: string = 'exportacao'): string {
  if (!columns || !Array.isArray(columns) || columns.length === 0) return '';
  
  const targetCols = columns.filter((c) => !tipo || c.section === tipo);
  if (targetCols.length === 0) return columns[0]?.id || '';

  if (destinoRaw) {
    const destClean = destinoRaw.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const matched = targetCols.find((c) => {
      const titleClean = (c.title || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      return titleClean.includes(destClean) || destClean.includes(titleClean);
    });
    if (matched) return matched.id;
  }

  // Retorna a primeira coluna válida de exportação por padrão para garantir a alocação
  return targetCols[0].id;
}

export function parsePlanillaText(txtContent: string, knownColumns?: string[]): { programacao: string; rows: PlanillaRow[] } {
  const lines = txtContent.split('\n');
  const programacao = programacaoFromHeader(txtContent);

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

    let cliente = 'VITOPEL';
    let destino = 'CORDOBA';

    const cleanLine = line.trim();
    if (cleanLine.endsWith('VITOPEL CORDOBA')) {
      cliente = 'VITOPEL';
      destino = 'CORDOBA';
    } else {
      const endMatch = cleanLine.match(/([A-Z0-9\s]+)\s+([A-Z\s]+)$/i);
      if (endMatch) {
        const parts = endMatch[0].trim().split(/\s+/);
        if (parts.length >= 2) {
          destino = parts.pop() || 'CORDOBA';
          cliente = parts.join(' ');
        }
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
      clienteDestino: `${cliente} / ${destino}`,
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
