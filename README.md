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

## Leitura de PDF com IA

Defina `ANTHROPIC_API_KEY` (e opcionalmente `ANTHROPIC_MODEL`). O PDF é enviado como bloco `document` para a API de Mensagens da Anthropic, que devolve JSON estruturado (`lib/server/pdf-extract.ts`). Sem a chave, ou em caso de erro, o sistema usa a **extração simulada** com placas reais do cadastro — o botão “Testar com PDF de exemplo” demonstra o fluxo completo.

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

**Persistência:** `data/state.json` (criado automaticamente com os dados de exemplo; apague o arquivo para reiniciar). Funciona em servidor próprio/VPS/Docker. Para Vercel ou múltiplas instâncias, troque `readState`/`writeState` em `lib/server/storage.ts` por Postgres/Supabase/Redis — o restante do app não muda.

**Tempo real:** quem visualiza recebe atualizações por *polling* (15s e ao voltar para a aba). Para atualização instantânea, substitua por Supabase Realtime, Pusher ou SSE dentro do `BoardProvider`. Conflitos de edição simultânea seguem a regra “última gravação vence”.

**Integração com rastreador:** hoje o macro é atualizado manualmente no diálogo da frota. Para automatizar, crie uma rota (ex.: `POST /api/macro`) que receba o webhook do rastreador e chame `updateVehicle(state, id, { macro, macroUpdatedAt })`.

**Logo:** coloque o arquivo oficial em `public/logo.png` (160×40). Enquanto ele não existir, a navbar mostra a marca em texto.
