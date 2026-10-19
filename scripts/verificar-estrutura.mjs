#!/usr/bin/env node
/**
 * Verifica a estrutura de pastas do projeto antes do build (roda sozinho em `npm run build`).
 *
 * Detecta:
 *  1. arquivos de código soltos na raiz (ex.: planilha-layout.ts fora de lib/)
 *  2. cópias criadas pelo navegador/Windows (ex.: "page (8).tsx", "route (1).ts")
 *  3. imports "@/..." ou "./..." que apontam para arquivos inexistentes
 *  4. diferença de maiúsculas/minúsculas no caminho (passa no Windows, quebra no Vercel)
 *
 * Uso: node scripts/verificar-estrutura.mjs [pasta-do-projeto]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] ?? process.cwd());
const IGNORE_DIRS = new Set(['node_modules', '.next', '.git', '.vercel', '.turbo', 'out']);
const CODE_DIRS = ['app', 'components', 'lib'];
const ROOT_ALLOWED = new Set([
  'package.json', 'package-lock.json', 'tsconfig.json', 'next.config.mjs', 'next.config.js', 'postcss.config.mjs',
  'tailwind.config.ts', 'next-env.d.ts', 'README.md', '.gitignore', '.env.example', '.eslintrc.json', 'vercel.json',
]);
const CODE_EXT = /\.(tsx?|jsx?|mjs|css|sql)$/i;
const DUPLICATE = /\s\(\d+\)(\.[^./\\]+)+$/; // "page (8).tsx"
const RESOLVE_EXT = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.css', '/index.ts', '/index.tsx', '/index.js'];

const problems = [];
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Existe exatamente com essa grafia (maiúsculas/minúsculas)? Retorna 'ok' | 'case' | 'missing' */
function existsExact(target) {
  if (!fs.existsSync(target)) return 'missing';
  const parts = path.relative(ROOT, target).split(path.sep);
  let cur = ROOT;
  for (const part of parts) {
    if (!fs.readdirSync(cur).includes(part)) return 'case';
    cur = path.join(cur, part);
  }
  return 'ok';
}

if (!fs.existsSync(path.join(ROOT, 'package.json'))) {
  console.error(`✖ ${ROOT} não parece ser a pasta do projeto (package.json não encontrado).`);
  process.exit(1);
}

const files = walk(ROOT);

// 1 e 2: soltos na raiz e duplicados
for (const f of files) {
  const r = rel(f);
  const name = path.basename(f);
  if (DUPLICATE.test(name)) {
    problems.push(`Cópia duplicada criada no download/upload: "${r}" → apague este arquivo.`);
  } else if (!r.includes('/') && CODE_EXT.test(name) && !ROOT_ALLOWED.has(name)) {
    problems.push(`Arquivo de código solto na raiz: "${r}" → ele deve ficar dentro de app/, components/, lib/ ou supabase/.`);
  }
}

// 3 e 4: imports quebrados
const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s+['"]([^'"]+)['"]/gm;
for (const f of files) {
  const r = rel(f);
  if (!CODE_DIRS.some((d) => r.startsWith(`${d}/`)) || !/\.(tsx?|jsx?|mjs)$/.test(f)) continue;
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (!spec || !(spec.startsWith('@/') || spec.startsWith('./') || spec.startsWith('../'))) continue;
    const base = spec.startsWith('@/') ? path.join(ROOT, spec.slice(2)) : path.resolve(path.dirname(f), spec);
    let status = 'missing';
    for (const ext of RESOLVE_EXT) {
      const s = existsExact(base + ext);
      if (s === 'ok') { status = 'ok'; break; }
      if (s === 'case') status = 'case';
    }
    if (status === 'missing') problems.push(`"${r}" importa "${spec}", mas o arquivo ${rel(base)}.ts(x) não existe nessa pasta.`);
    if (status === 'case') problems.push(`"${r}" importa "${spec}" com maiúsculas/minúsculas diferentes do nome real do arquivo (o Vercel diferencia).`);
  }
}

if (problems.length) {
  console.error('\n✖ Estrutura de pastas com problema — o build foi interrompido:\n');
  for (const p of problems) console.error(`  • ${p}`);
  console.error('\nCorrija com: node scripts/sincronizar-repo.mjs <pasta-do-repositorio>  (rodando a partir da pasta extraída do zip)\n');
  process.exit(1);
}
console.log(`✔ Estrutura de pastas OK (${files.length} arquivos verificados).`);
