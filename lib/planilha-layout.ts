/**
 * Layout do Quadro de Frotas no formato da planilha "PROGRAMAÇÃO FROTAS".
 *
 * Cada coluna de dados (quadro_colunas) vira uma coluna da grade. Os cabeçalhos de cima
 * (PORTO ALEGRE › A CAMINHO › CARREGADOS) vêm de `path`, que agrupa colunas vizinhas.
 * Colunas que não estão no mapa (ex.: um destino novo) entram automaticamente na seção certa.
 */
import type { Column } from './types';
import { SEM_PROGRAMACAO } from './mock-data';
import { COUNTRY_LABEL } from './utils';

export type LeafKind = 'blocos' | 'lista';

interface LeafConfig {
  /** Cabeçalhos acima da coluna, do mais externo para o mais interno */
  path: string[];
  /** Título da própria coluna; null = sem título (os blocos fazem o papel de cabeçalho) */
  title?: string | null;
  /** Largura em colunas da planilha */
  span?: number;
  /** blocos = Programação/CRT com cabeçalho azul · lista = frotas direto, sem bloco */
  kind?: LeafKind;
}

/** Colunas fixas da planilha, na ordem em que aparecem */
export const SHEET_STATUS_ORDER = ['a-caminho', 'a-caminho-vazios', 'aguardando', 'voltando', 'voltando-tri'];
export const SHEET_IMPORT_ORDER = ['uruguai-imp', 'uruguai-treinta', 'argentina-imp'];

const LAYOUT: Record<string, LeafConfig> = {
  'a-caminho': { path: ['Porto Alegre', 'A Caminho'], title: 'Carregados', kind: 'blocos' },
  'a-caminho-vazios': { path: ['Porto Alegre', 'A Caminho'], title: 'Vazios', kind: 'lista' },
  aguardando: { path: ['Porto Alegre'], title: 'Aguardando Carga', span: 2, kind: 'lista' },
  voltando: { path: ['Porto Alegre', 'Voltando'], title: 'Gua x Uru', kind: 'lista' },
  'voltando-tri': { path: ['Porto Alegre', 'Voltando'], title: 'Tri x Uru', kind: 'lista' },
  [SEM_PROGRAMACAO]: { path: [], title: 'Sem Programação', span: 2, kind: 'lista' },
  'uruguai-imp': { path: ['Importação', 'Uruguai'], title: null, kind: 'blocos' },
  'uruguai-treinta': { path: ['Importação', 'Uruguai'], title: null, kind: 'blocos' },
  'argentina-imp': { path: ['Importação'], title: 'Argentina', kind: 'blocos' },
};

function configFor(c: Column): Required<LeafConfig> {
  const known = LAYOUT[c.id];
  if (known) return { path: known.path, title: known.title === undefined ? c.title : known.title, span: known.span ?? 1, kind: known.kind ?? 'blocos' };
  if (c.section === 'importacao') {
    return { path: ['Importação', COUNTRY_LABEL[c.country ?? ''] ?? 'Outros'], title: c.title, span: 1, kind: 'blocos' };
  }
  return { path: [], title: c.title, span: 1, kind: 'blocos' };
}

export interface SheetLeaf {
  column: Column;
  path: string[];
  title: string | null;
  span: number;
  kind: LeafKind;
  /** linha da grade (1-based) onde começa o corpo da coluna */
  bodyRow: number;
  colStart: number;
  colEnd: number;
}

export interface SheetHeader {
  key: string;
  title: string;
  row: number;
  colStart: number;
  colEnd: number;
  leafId?: string;
}

export interface SheetLayout {
  leaves: SheetLeaf[];
  headers: SheetHeader[];
  /** quantidade de linhas de cabeçalho (a linha do corpo é headerRows + 1) */
  headerRows: number;
  gridTemplateColumns: string;
}

/** Ordem da planilha: exportação → Porto Alegre → Sem Programação → importação */
export function orderColumns(columns: Column[]): Column[] {
  const rank = (c: Column) => {
    if (c.section === 'exportacao') return 0;
    if (c.section === 'status') {
      const i = SHEET_STATUS_ORDER.indexOf(c.id);
      if (c.id === SEM_PROGRAMACAO) return 2000;
      return i >= 0 ? 1000 + i : 1500;
    }
    const i = SHEET_IMPORT_ORDER.indexOf(c.id);
    return i >= 0 ? 3000 + i : 3500;
  };
  return columns
    .map((c, idx) => ({ c, idx }))
    .sort((a, b) => rank(a.c) - rank(b.c) || a.idx - b.idx)
    .map((x) => x.c);
}

export function buildSheetLayout(columns: Column[], unitWidth = 92): SheetLayout {
  let col = 1;
  const raw = orderColumns(columns).map((c) => {
    const cfg = configFor(c);
    const leaf = { column: c, path: cfg.path, title: cfg.title, span: cfg.span, kind: cfg.kind, colStart: col, colEnd: col + cfg.span, bodyRow: 0 };
    col += cfg.span;
    return leaf;
  });
  const headerRows = Math.max(1, ...raw.map((l) => l.path.length + (l.title ? 1 : 0)));
  const leaves: SheetLeaf[] = raw.map((l) => ({ ...l, bodyRow: l.path.length + (l.title ? 1 : 0) + 1 }));

  const headers: SheetHeader[] = [];
  for (let depth = 0; depth < headerRows; depth++) {
    let i = 0;
    while (i < leaves.length) {
      const l = leaves[i];
      if (l.path.length <= depth) {
        i++;
        continue;
      }
      const prefix = l.path.slice(0, depth + 1).join('›');
      let j = i;
      while (j + 1 < leaves.length && leaves[j + 1].path.length > depth && leaves[j + 1].path.slice(0, depth + 1).join('›') === prefix) j++;
      headers.push({ key: `${depth}-${i}`, title: l.path[depth], row: depth + 1, colStart: l.colStart, colEnd: leaves[j].colEnd });
      i = j + 1;
    }
  }
  for (const l of leaves) {
    if (l.title) headers.push({ key: `leaf-${l.column.id}`, title: l.title, row: l.path.length + 1, colStart: l.colStart, colEnd: l.colEnd, leafId: l.column.id });
  }

  // uma faixa por coluna da planilha (colunas duplas ocupam duas, como no Excel)
  const units = leaves.reduce((acc, l) => acc + l.span, 0);
  const gridTemplateColumns = `repeat(${units}, minmax(${unitWidth}px, 1fr))`;
  return { leaves, headers, headerRows, gridTemplateColumns };
}

/** Nome completo da coluna para listas e diálogos: "Porto Alegre › A Caminho › Carregados" */
export function columnLabel(c: Column): string {
  const cfg = configFor(c);
  return [...cfg.path, cfg.title ?? c.title].filter(Boolean).join(' › ');
}

export function leafKind(c: Column): LeafKind {
  return configFor(c).kind;
}
