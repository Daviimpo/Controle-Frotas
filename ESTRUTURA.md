# Estrutura de pastas do projeto

Cada arquivo **precisa** estar exatamente neste caminho, relativo à raiz do repositório (onde fica o `package.json`).
O Vercel diferencia maiúsculas de minúsculas, e o `@/` dos imports aponta para a raiz.

```
(raiz do repositório)
├── package.json · package-lock.json · tsconfig.json · next.config.mjs
├── postcss.config.mjs · tailwind.config.ts · .gitignore · .env.example · README.md · ESTRUTURA.md
├── app/
│   ├── layout.tsx · page.tsx · globals.css
│   ├── quadro/page.tsx
│   ├── cadastro/page.tsx
│   ├── importar-pdf/page.tsx
│   └── api/
│       ├── state/route.ts
│       ├── auth/login/route.ts · auth/logout/route.ts · auth/me/route.ts
│       ├── frotas/route.ts · frotas/import/route.ts
│       ├── extract-pdf/route.ts
│       └── pdf/confirm/route.ts
├── components/
│   ├── board/        board-ui.tsx · dialogs.tsx · frota-badge.tsx · planilha-board.tsx
│   ├── layout/       navbar.tsx
│   ├── providers/    app-providers.tsx · auth-provider.tsx · board-provider.tsx
│   └── ui/           index.tsx
├── lib/
│   ├── board-ops.ts · macro.ts · mock-data.ts · planilha-layout.ts · types.ts · utils.ts
│   ├── pdf/          planilla.ts
│   └── server/       http.ts · pdf-extract.ts · session.ts · storage.ts · supabase.ts
├── scripts/          sincronizar-repo.mjs · verificar-estrutura.mjs
├── supabase/
│   ├── diagnostico_schema.sql
│   └── migrations/   0001_controle_frotas.sql · 0002_corrigir_schema_existente.sql · 0003_layout_planilha.sql
├── data/.gitkeep
└── exemplos/planilla_388_texto.pdf
```

Atenção ao nome dos arquivos:
- Vários arquivos têm o **mesmo nome em pastas diferentes**: `page.tsx` (4×) e `route.ts` (8×). Por isso não dá para enviá-los soltos: o navegador renomeia para `page (8).tsx` e `route (1).ts`, e o Next.js deixa de encontrá-los.
- Nenhum arquivo `.ts`/`.tsx` deve ficar na raiz, exceto `tailwind.config.ts` e o `next-env.d.ts` gerado pelo Next.

## Como atualizar o repositório com um zip novo (recomendado)

1. **Extraia o zip inteiro** (Windows: botão direito → "Extrair tudo…"). Vai aparecer a pasta `polivias-frotas`, já com todas as subpastas.
2. Abra um terminal **dentro da pasta extraída** `polivias-frotas` e rode a simulação (não altera nada):
   ```
   node scripts/sincronizar-repo.mjs "C:\caminho\do\seu-repositorio"
   ```
   Ela mostra o que vai remover (soltos na raiz, cópias "(n)", arquivos de versões antigas) e o que vai copiar.
3. Se a lista estiver certa, aplique:
   ```
   node scripts/sincronizar-repo.mjs "C:\caminho\do\seu-repositorio" --aplicar
   ```
   - Ele nunca mexe em `.git`, `node_modules`, `.next`, `.vercel` nem nos seus arquivos `.env*`.
   - Arquivos que só existem no seu repositório dentro de `app/`, `components/` e `lib/` são **mantidos** e listados para você conferir.
   - Arquivos com o mesmo caminho são **substituídos** pela versão do zip. Se você mudou algum deles, revise com `git diff` antes do commit.
4. No repositório:
   ```
   git add -A
   git commit -m "Atualiza Controle de Frotas"
   git push
   ```
   Sem linha de comando, no **GitHub Desktop**: confira as mudanças → *Commit to main* → *Push origin*.

## Se for usar o upload pelo site do GitHub

Use **"Add file → Upload files"** e **arraste as PASTAS** (`app`, `components`, `lib`, `scripts`, `supabase`…) junto com os arquivos da raiz, a partir da pasta extraída. No Chrome e no Edge, arrastar a pasta mantém os caminhos.

Não use o botão "choose your files" nem selecione arquivos dentro das pastas: os caminhos se perdem. Antes de confirmar o commit, confira na lista do GitHub se os nomes aparecem com a pasta (ex.: `lib/planilha-layout.ts`).

## Proteção no build

`npm run build` roda antes `scripts/verificar-estrutura.mjs`, e no Vercel isso acontece automaticamente. Se houver arquivo solto na raiz, cópia "(n)", import apontando para um arquivo que não existe, ou diferença de maiúsculas/minúsculas, o build para com uma mensagem em português dizendo qual arquivo corrigir.

Para conferir localmente: `npm run verificar`.
