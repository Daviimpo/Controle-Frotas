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

// Mapeamento de destinos da Argentina para as colunas do Quadro de Frotas
export function destinoToColumnId(destinoRaw: string): string {
  const d = destinoRaw.toUpperCase().trim();
  if (d.includes('ZARATE')) return 'zarate';
  if (d.includes('BUENOS AIRES') || d.includes('BS AS') || d.includes('CABA')) return 'buenos-aires';
  if (d.includes('CORDOBA')) return 'cordoba';
  if (d.includes('ROSARIO')) return 'rosario';
  if (d.includes('PILAR')) return 'pilar';
  if (d.includes('SANTIAGO')) return 'santiago';
  if (d.includes('MENDOZA')) return 'mendoza';
  return 'zarate'; // Coluna padrão caso não identifique
}

// Limpa formatação de placas (remove hífens, pontos e espaços)
function cleanPlate(plate: string): string {
  return plate.replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

// Parser exclusivo para arquivos de texto (.TXT)
export function parseTxtPlanilla(txtContent: string): PlanillaRow[] {
  const lines = txtContent.split('\n');
  let programacao = '';

  // 1. Localiza a Programação no cabeçalho
  for (const line of lines) {
    const progMatch = line.match(/Planilla\s+de\s+Programacion\s+N[§\d]*\s+(\d+)\/(\d+)/i);
    if (progMatch) {
      programacao = progMatch[1];
      break;
    }
  }

  const rows: PlanillaRow[] = [];

  // 2. Lê as linhas de dados do CONOCIMIENTO
  for (const line of lines) {
    // Ignora linhas de cabeçalho, separadores e subtotais
    if (
      !line.includes('BR-135.') || 
      line.includes('CONOCIMIENTO') || 
      line.trim().startsWith('---') || 
      line.trim().startsWith('___')
    ) {
      continue;
    }

    // Extrai o CONOCIMIENTO / CRT
    const crtMatch = line.match(/(BR-135\.\d+)/);
    if (!crtMatch) continue;

    const conocimientoOriginal = crtMatch[1];
    // Pega os últimos dígitos sem zeros à esquerda (ex: BR-135.057462 -> 57462)
    const crtDigits = conocimientoOriginal.replace('BR-135.', '').replace(/^0+/, '');

    // Extrai placas de Camión e Semi-Remolque
    const plateMatches = line.match(/([A-Z0-9]{3,4}[-\s]?[A-Z0-9]{3,4}\.-?)/gi);
    const placaCavalo = plateMatches && plateMatches[0] ? cleanPlate(plateMatches[0]) : '';
    const placaCarreta = plateMatches && plateMatches[1] ? cleanPlate(plateMatches[1]) : '';

    // Extrai Cliente e Destino do final da linha (ex: VITOPEL CORDOBA)
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
    });
  }

  return rows;
}
