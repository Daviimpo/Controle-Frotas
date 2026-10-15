# Polivias Transportes · Controle de Frotas

Painel de **Programação e Controle de Frotas** (64 veículos no Mercosul) — Next.js 14 (App Router) + Tailwind CSS + Lucide.

## Como rodar

```bash
npm install
cp .env.example .env.local   # ajuste usuários/senhas e, se quiser, a chave da Anthropic
npm run dev                  # http://localhost:3000
```

Produção: `npm run build && npm start`.

Login padrão (troque em `POLIVIAS_USERS`): **admin / polivias@2026** · **operador / operador@2026**.

## Funcionalidades

| Aba | O que faz | Acesso |
|---|---|---|
| **Dashboard** | KPIs, distribuição por destino/status, programações ativas, busca “Onde está a frota?” e lista de alertas de macro | Público |
| **Quadro de Frotas** | Kanban em 3 seções (Exportação · Status Operacionais · Importação). Blocos **P: 384 – CRT 57305** agrupam várias frotas. Arrastar e soltar, criar/editar blocos, novos destinos, atualizar macro, “Mover para…” (celular) | Leitura pública · edição com login |
| **Importar PDF** | Upload drag‑and‑drop da *Planilla de Programación*; IA extrai placas, CRT (5 últimos dígitos), programação, destino e cliente; cruza placas (cavalo **ou** carreta) com o cadastro; tela de pré-visualização editável antes de alocar | Login |
| **Cadastro Frotas** | Tabela somente leitura (dados mudam só via planilha CSV/Excel, modo *Mesclar* ou *Substituir*), seleção em massa com exclusão, exportar Excel, modelo CSV | Leitura pública · importar/excluir com login |

**Macros do rastreador** — VAZIO, DESTINADO, CARGA, VIAGEM, DESCARGA, MANUTENÇÃO. Cada frota no quadro aparece com a cor da sua macro (`MACROS` em `lib/macro.ts`; componente `FrotaBadge` em `components/board/frota-badge.tsx`). Valores como `"VIAGEM"`, `"Manutenção"` ou os nomes antigos (`carregamento`, `descarregando`) são convertidos automaticamente por `normalizeMacro`; macro desconhecida vira VIAGEM.

**Alertas de macro** (contorno no badge):
- 🟡 macro sem atualização há mais de 12h (`STALE_HOURS` em `lib/macro.ts`);
- 🔴 macro incompatível com a posição no quadro (ex.: frota em “Carregados” com macro “Vazio”). Os macros esperados ficam em cada coluna/bloco (`expectedMacros`).

## Importação da Planilla de Programación (Argentina)

| Campo | Regra | Exemplo |
|---|---|---|
| Programação | número antes da barra em “Planilla de Programacion N§ 388/2026” | `388` |
| CRT | último grupo numérico do CONOCIMIENTO, até 6 dígitos, sem zeros à esquerda | `BR-135.057340` → `57340` |
| Placas | CAMION e SEMI-REMOLQUE limpas (`OLS-010.-` → `OLS010`) e cruzadas com `frotas` (cavalo primeiro, depois carreta). Só as encontradas são vinculadas | Frota 230 |
| Cliente | penúltima coluna | `SOFTYS` |
| Destino | última coluna → coluna do quadro pelo nome | `ZARATE` → `zarate` |

Regras em `lib/pdf/planilla.ts` (funções puras). A leitura é feita assim:
1. **PDF com texto** (gerado pelo sistema): parser determinístico, sem custo de IA.
2. **PDF digitalizado** (foto/scan com anotações): Claude lê a tabela (`ANTHROPIC_API_KEY`), e o retorno passa pelas mesmas regras. Sem a chave, aparece um erro claro e nenhum dado inventado.

**Confirmar** (`POST /api/pdf/confirm`) cria ou atualiza o bloco Programação + CRT em `quadro_frotas`: se o bloco já existir em qualquer coluna, ele vai para a coluna do destino. As frotas saem do bloco anterior, e a macro escolhida (padrão VIAGEM) é gravada em `frotas`. Reimportar o mesmo PDF não duplica blocos.

## Arquitetura

```
app/
  page.tsx               Dashboard
  quadro/                Quadro de Frotas (Kanban)
  importar-pdf/          Upload + pré-visualização + confirmação
  cadastro/              Cadastro e importação de planilha
  api/state              GET público · PUT exige sessão
  api/auth/*             login / logout / me (cookie httpOnly assinado com HMAC)
  api/extract-pdf        leitura do PDF (Claude ou simulação)
components/
  board/                 FleetBoard, BoardColumn, GroupBlock, FrotaChip, diálogos
  providers/             AuthProvider, BoardProvider (sincronização a cada 15s)
  ui/                    Button, Card, Badge, Input, Select, Dialog (estilo shadcn)
lib/
  board-ops.ts           todas as operações do quadro (funções puras)
  mock-data.ts           64 frotas + colunas + blocos iniciais
  macro.ts               regras de alerta
  server/                storage (JSON em disco), sessão, extração de PDF
```

**Persistência (Supabase):**

1. No SQL Editor do Supabase, rode `supabase/migrations/0001_controle_frotas.sql`. Ele cria `frotas`, `quadro_frotas` (blocos Programação/CRT com `frota_ids`), `quadro_colunas`, `quadro_meta` e um trigger que tira a frota excluída dos blocos. O script pode ser rodado mais de uma vez.
2. Em `.env.local` (e nas variáveis do Vercel) defina `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`. A chave é usada só no servidor, nunca com `NEXT_PUBLIC_`.
3. Opcional: `SEED_MOCK_DATA=true` cria as 64 frotas de exemplo **uma única vez**, só se a tabela `frotas` estiver vazia na primeira execução.

Fluxo de gravação:
- **Importar planilha** → `POST /api/frotas/import` → upsert/delete direto em `frotas`.
- **Excluir em massa** → `DELETE /api/frotas` → delete em `frotas` (o trigger limpa `quadro_frotas`).
- **Quadro** (mover frota, blocos, colunas, macro) → `PUT /api/state` → `quadro_frotas`, `quadro_colunas` e macro em `frotas`. Se outra aba salvou antes, a resposta é 409 e a tela recarrega a versão do banco em vez de sobrescrevê-la.
- Qualquer falha do banco aparece como erro na tela; nada fica salvo só em memória.

Sem as variáveis do Supabase, o app usa `data/state.json` (apenas para desenvolvimento local).

**Tempo real:** quem visualiza recebe atualizações por *polling* (15s e ao voltar para a aba). Para atualização instantânea, substitua por Supabase Realtime, Pusher ou SSE dentro do `BoardProvider`. Conflitos de edição simultânea seguem a regra “última gravação vence”.

**Integração com rastreador:** hoje o macro é atualizado manualmente no diálogo da frota. Para automatizar, crie uma rota (ex.: `POST /api/macro`) que receba o webhook do rastreador e chame `updateVehicle(state, id, { macro, macroUpdatedAt })`.

**Logo:** coloque o arquivo oficial em `public/logo.png` (160×40). Enquanto ele não existir, a navbar mostra a marca em texto.
