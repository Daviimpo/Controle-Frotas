import type { BoardState, Column, Group, Macro, Vehicle } from './types';

export const SEM_PROGRAMACAO = 'sem-programacao';

const EXPORT_MACROS: Macro[] = ['viagem', 'descarregando'];
const IMPORT_MACROS: Macro[] = ['carregamento', 'viagem', 'descarregando'];

export const DEFAULT_COLUMNS: Column[] = [
  // Exportação — destinos
  { id: 'buenos-aires', title: 'Buenos Aires', section: 'exportacao', country: 'AR', expectedMacros: EXPORT_MACROS },
  { id: 'rosario', title: 'Rosario', section: 'exportacao', country: 'AR', expectedMacros: EXPORT_MACROS },
  { id: 'pilar', title: 'Pilar', section: 'exportacao', country: 'AR', expectedMacros: EXPORT_MACROS },
  { id: 'cordoba', title: 'Córdoba', section: 'exportacao', country: 'AR', expectedMacros: EXPORT_MACROS },
  { id: 'zarate', title: 'Zárate', section: 'exportacao', country: 'AR', expectedMacros: EXPORT_MACROS },
  { id: 'santiago-cl', title: 'Santiago CL', section: 'exportacao', country: 'CL', expectedMacros: EXPORT_MACROS },
  // Status operacionais
  { id: 'a-caminho', title: 'A Caminho', section: 'status', subtitle: 'Carregados / Vazios', expectedMacros: ['carregamento', 'viagem', 'vazio'] },
  { id: 'aguardando', title: 'Aguardando Carga', section: 'status', subtitle: 'Porto Alegre', country: 'BR', expectedMacros: ['vazio', 'carregamento'] },
  { id: 'voltando', title: 'Voltando', section: 'status', subtitle: 'Retorno ao Brasil', expectedMacros: ['vazio', 'viagem'] },
  { id: SEM_PROGRAMACAO, title: 'Sem Programação', section: 'status', subtitle: 'Frotas disponíveis' },
  // Importação
  { id: 'uruguai-imp', title: 'Uruguai', section: 'importacao', country: 'UY', expectedMacros: IMPORT_MACROS },
  { id: 'argentina-imp', title: 'Argentina', section: 'importacao', country: 'AR', expectedMacros: IMPORT_MACROS },
];

const FIRST = ['João', 'Carlos', 'Marcos', 'Paulo', 'Luiz', 'Anderson', 'Rafael', 'Jorge', 'Sérgio', 'Fábio', 'Roberto', 'Gilmar', 'Cristiano', 'Valdir', 'Edson', 'Leandro'];
const LAST = ['da Silva', 'Pereira', 'Rodrigues', 'Oliveira', 'Schneider', 'Bortolini', 'Machado', 'Costa', 'Fagundes', 'Becker', 'Rosa', 'Moraes', 'Kunz', 'Teixeira', 'Lopes', 'Dornelles'];
const CAVALO_PREFIX = ['OAD', 'IXR', 'IZT', 'JBC', 'QHK', 'RLM', 'IVP', 'IYB'];
const CARRETA_PREFIX = ['IWK', 'JAQ', 'IUN', 'QIS', 'RKZ', 'IXF', 'IPD', 'JCA'];
const MERCOSUL_LETTERS = 'ABCDEFGHJ';

function frotaNumbers() {
  const set = new Set([161, 177, 243]);
  let n = 101;
  while (set.size < 64) {
    set.add(n);
    n += 3;
  }
  return Array.from(set).sort((a, b) => a - b);
}

function plate(prefix: string, seed: number, mercosul: boolean) {
  const num = String(seed % 10000).padStart(4, '0');
  if (!mercosul) return `${prefix}-${num}`;
  return `${prefix}-${num[0]}${MERCOSUL_LETTERS[seed % MERCOSUL_LETTERS.length]}${num.slice(2)}`;
}

/** Estado inicial realista para o protótipo funcionar imediatamente */
export function createMockState(): BoardState {
  const now = Date.now();
  const ago = (h: number) => new Date(now - h * 3_600_000).toISOString();
  const nums = frotaNumbers();

  const vehicles: Vehicle[] = nums.map((n, i) => ({
    id: `v-${n}`,
    frota: String(n),
    placaCavalo: n === 161 ? 'OAD-5041' : plate(CAVALO_PREFIX[i % 8], n * 37 + 1000, i % 3 === 0),
    placaCarreta: plate(CARRETA_PREFIX[(i + 3) % 8], n * 53 + 1234, i % 4 === 0),
    motorista: `${FIRST[i % 16]} ${LAST[(i * 7 + 3) % 16]}`,
    macro: 'vazio',
    macroUpdatedAt: ago(((i * 5) % 9) * 0.6 + 0.3),
  }));

  const vById = new Map(vehicles.map((v) => [v.id, v]));
  const id = (n: number) => `v-${n}`;
  const others = nums.filter((n) => ![161, 177, 243].includes(n));
  let k = 0;
  const take = (count: number) => others.slice(k, (k += count)).map(id);

  const groups: Group[] = [];
  const g = (columnId: string, data: Partial<Group>, ids: string[], macro: Macro) => {
    groups.push({ id: `g-${groups.length + 1}`, columnId, frotaIds: ids, createdAt: ago(30), ...data });
    ids.forEach((vid) => {
      const v = vById.get(vid);
      if (v) v.macro = macro;
    });
  };

  // Exportação
  g('buenos-aires', { programacao: '384', crt: '57305', cliente: 'Sulpapéis' }, [161, 177, 243].map(id), 'viagem');
  g('buenos-aires', { programacao: '391', crt: '57412', cliente: 'CMPC Celulose' }, take(2), 'descarregando');
  g('rosario', { programacao: '386', crt: '57318', cliente: 'Basso' }, take(2), 'viagem');
  g('pilar', { programacao: '388', crt: '57350', cliente: 'Sulpapéis' }, take(3), 'viagem');
  g('cordoba', { programacao: '379', crt: '57221', cliente: 'Klabin' }, take(1), 'descarregando');
  g('zarate', { programacao: '390', crt: '57401', cliente: 'Braskem' }, take(2), 'viagem');
  g('santiago-cl', { programacao: '372', crt: '57198', cliente: 'Tramontina' }, take(2), 'viagem');

  // Status operacionais
  g('a-caminho', { label: 'Carregados', expectedMacros: ['carregamento', 'viagem'] }, take(4), 'viagem');
  g('a-caminho', { label: 'Vazios - Sulpapéis', expectedMacros: ['vazio'] }, take(2), 'vazio');
  g('a-caminho', { label: 'Vazios - Basso', expectedMacros: ['vazio'] }, take(2), 'vazio');
  g('aguardando', { label: 'Porto Alegre' }, take(5), 'vazio');
  g('voltando', { label: 'Guaíba x Uruguaiana' }, take(4), 'vazio');
  g('voltando', { label: 'Triunfo x Uruguaiana' }, take(3), 'vazio');

  // Importação
  g('uruguai-imp', { label: 'Salto', crt: '497' }, take(2), 'carregamento');
  g('uruguai-imp', { label: 'Treinta y Tres', crt: '499' }, take(1), 'viagem');
  g('uruguai-imp', { crt: '498' }, take(2), 'viagem');
  g('uruguai-imp', { crt: '500' }, take(1), 'carregamento');
  g('argentina-imp', { crt: '3058' }, take(2), 'viagem');
  g('argentina-imp', { crt: '3046' }, take(2), 'descarregando');

  // Inconsistências propositais para demonstrar os alertas de macro
  const set = (n: number, patch: Partial<Vehicle>) => Object.assign(vById.get(id(n)) ?? {}, patch);
  set(177, { macroUpdatedAt: ago(16) }); // sem atualizar
  set(others[11], { macro: 'vazio' }); // em "Carregados" mas macro vazio
  set(others[20], { macro: 'descarregando' }); // aguardando carga com macro descarregando
  set(others[25], { macroUpdatedAt: ago(26) });
  set(others[36], { macroUpdatedAt: ago(14) });

  return {
    vehicles,
    columns: DEFAULT_COLUMNS,
    groups,
    updatedAt: new Date(now).toISOString(),
    updatedBy: 'sistema',
    version: 1,
  };
}
