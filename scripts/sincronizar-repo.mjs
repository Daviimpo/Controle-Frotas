#!/usr/bin/env node
/**
 * Copia esta versão do projeto para o seu repositório Git, cada arquivo na pasta certa,
 * e remove os arquivos soltos na raiz e as cópias "(1)", "(8)" criadas por upload/download.
 *
 * Uso (rodando a partir da pasta EXTRAÍDA do zip):
 *   node scripts/sincronizar-repo.mjs "C:\caminho\do\seu-repositorio"            ← só mostra o que vai fazer
 *   node scripts/sincronizar-repo.mjs "C:\caminho\do\seu-repositorio" --aplicar  ← faz as mudanças
 *
 * Nunca mexe em: .git, node_modules, .next, .vercel, arquivos .env*
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEST = process.argv[2] && !process.argv[2].startsWith('--') ? path.resolve(process.argv[2]) : null;
const APPLY = process.argv.includes('--aplicar');

const IGNORE_DIRS = new Set(['node_modules', '.next', '.git', '.vercel', '.turbo', 'out']);
const ROOT_ALLOWED = new Set([
  'package.json', 'package-lock.json', 'tsconfig.json', 'next.config.mjs', 'next.config.js', 'postcss.config.mjs',
  'tailwind.config.ts', 'next-env.d.ts', 'README.md', '.gitignore', '.env.example', '.eslintrc.json', 'vercel.json',
]);
/** Arquivos de versões anteriores que não existem mais (substituídos pelo layout da planilha) */
const OBSOLETE = [
  'components/board/fleet-board.tsx',
  'components/board/board-column.tsx',
  'components/board/group-block.tsx',
  'components/board/frota-chip.tsx',
  'supabase/migrations/0003_alinhar_tipos.sql',
];
const CODE_EXT = /\.(tsx?|jsx?|mjs|css|sql|pdf)$/i;
const DUPLICATE = /\s\(\d+\)(\.[^./\\]+)+$/;

const rel = (root, p) => path.relative(root, p).split(path.sep).join('/');
function walk(root, dir = root, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(root, full, out);
    else out.push(rel(root, full));
  }
  return out;
}

if (!DEST) {
  console.log('Uso: node scripts/sincronizar-repo.mjs <pasta-do-repositorio> [--aplicar]');
  process.exit(1);
}
if (!fs.existsSync(DEST) || !fs.statSync(DEST).isDirectory()) {
  console.error(`✖ Pasta não encontrada: ${DEST}`);
  process.exit(1);
}
if (path.resolve(DEST) === SRC) {
  console.error('✖ A pasta de destino é a própria pasta extraída do zip. Informe a pasta do seu repositório Git.');
  process.exit(1);
}
if (!fs.existsSync(path.join(DEST, '.git'))) {
  console.warn(`⚠ ${DEST} não tem a pasta .git — confira se é mesmo a raiz do repositório.`);
}

// Arquivos desta versão (o "manifesto")
const manifest = walk(SRC).filter(
  (f) => !/^data\/.+\.json$/.test(f) && !f.endsWith('.tsbuildinfo') && f !== 'next-env.d.ts' && !/^\.env(?!\.example)/.test(path.basename(f)),
);
const manifestSet = new Set(manifest);

// O que existe hoje no repositório
const current = walk(DEST);
const toDelete = [];
const extras = [];
for (const f of current) {
  const name = path.basename(f);
  if (/^\.env/.test(name) && name !== '.env.example') continue; // nunca mexe em segredos
  if (DUPLICATE.test(name)) toDelete.push([f, 'cópia duplicada']);
  else if (!f.includes('/') && CODE_EXT.test(name) && !ROOT_ALLOWED.has(name) && !manifestSet.has(f)) toDelete.push([f, 'solto na raiz']);
  else if (OBSOLETE.includes(f)) toDelete.push([f, 'arquivo de versão antiga']);
  else if (!manifestSet.has(f) && /^(app|components|lib)\//.test(f)) extras.push(f);
}

let novos = 0;
let alterados = 0;
const copies = [];
for (const f of manifest) {
  const target = path.join(DEST, f);
  if (!fs.existsSync(target)) {
    novos++;
    copies.push([f, 'novo']);
  } else if (!fs.readFileSync(target).equals(fs.readFileSync(path.join(SRC, f)))) {
    alterados++;
    copies.push([f, 'atualizado']);
  }
}

console.log(`\nOrigem : ${SRC}\nDestino: ${DEST}\n`);
console.log(`Arquivos para REMOVER (${toDelete.length}):`);
toDelete.forEach(([f, why]) => console.log(`  - ${f}   (${why})`));
console.log(`\nArquivos para COPIAR na pasta certa (${copies.length}: ${novos} novos, ${alterados} atualizados):`);
copies.forEach(([f, why]) => console.log(`  + ${f}   (${why})`));
if (extras.length) {
  console.log(`\nArquivos que só existem no seu repositório (mantidos; confira se ainda são usados):`);
  extras.forEach((f) => console.log(`  ? ${f}`));
}

if (!APPLY) {
  console.log('\nNada foi alterado (simulação). Para aplicar, rode de novo com --aplicar\n');
  process.exit(0);
}

for (const [f] of toDelete) fs.rmSync(path.join(DEST, f), { force: true });
for (const [f] of copies) {
  const target = path.join(DEST, f);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(SRC, f), target);
}
// remove pastas que ficaram vazias depois da limpeza (fora as protegidas)
for (const d of ['components/board', 'components', 'lib', 'app']) {
  const p = path.join(DEST, d);
  if (fs.existsSync(p) && fs.readdirSync(p).length === 0) fs.rmdirSync(p);
}

console.log(`\n✔ Aplicado: ${toDelete.length} removidos, ${copies.length} copiados.\n`);
const check = spawnSync(process.execPath, [path.join(DEST, 'scripts', 'verificar-estrutura.mjs'), DEST], { stdio: 'inherit' });
if (check.status === 0) {
  console.log('\nPróximos passos no repositório:\n  git add -A\n  git commit -m "Corrige estrutura de pastas"\n  git push\n');
}
process.exit(check.status ?? 0);
