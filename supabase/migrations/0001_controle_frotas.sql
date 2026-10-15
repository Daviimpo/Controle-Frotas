-- =====================================================================
-- Polivias · Controle de Frotas — esquema Supabase
-- Rode no SQL Editor do Supabase (ou `supabase db push`).
-- Seguro para rodar mais de uma vez.
-- =====================================================================

-- Cadastro de veículos (alimentado pela importação de planilha)
create table if not exists public.frotas (
  id               text primary key,
  frota            text not null unique,
  placa_cavalo     text not null default '',
  placa_carreta    text not null default '',
  motorista        text not null default '',
  macro            text not null default 'vazio'
                   check (macro in ('vazio','destinado','carga','viagem','descarga','manutencao')),
  macro_updated_at timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Colunas do quadro (destinos de exportação, status, origens de importação)
create table if not exists public.quadro_colunas (
  id               text primary key,
  titulo           text not null,
  secao            text not null check (secao in ('exportacao','status','importacao')),
  subtitulo        text,
  pais             text,
  macros_esperadas text[],
  ordem            int  not null default 0
);

-- Blocos do quadro (Programação + CRT / grupos) com as frotas alocadas
create table if not exists public.quadro_frotas (
  id               text primary key,
  coluna_id        text not null references public.quadro_colunas(id) on delete cascade,
  rotulo           text,
  programacao      text,
  crt              text,
  cliente          text,
  macros_esperadas text[],
  frota_ids        text[] not null default '{}',
  ordem            int  not null default 0,
  created_at       timestamptz not null default now()
);
create index if not exists quadro_frotas_frota_ids_idx on public.quadro_frotas using gin (frota_ids);

-- Controle de versão do quadro (evita que uma aba desatualizada sobrescreva outra)
create table if not exists public.quadro_meta (
  id         int primary key default 1 check (id = 1),
  version    bigint not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Ao excluir uma frota, ela sai automaticamente de todos os blocos do quadro
create or replace function public.remover_frota_do_quadro() returns trigger
language plpgsql as $$
begin
  update public.quadro_frotas
     set frota_ids = array_remove(frota_ids, old.id)
   where old.id = any(frota_ids);
  return old;
end $$;

drop trigger if exists trg_remover_frota_do_quadro on public.frotas;
create trigger trg_remover_frota_do_quadro
  after delete on public.frotas
  for each row execute function public.remover_frota_do_quadro();

-- Segurança: RLS ligado e SEM políticas públicas.
-- O app acessa só pelo servidor com a SUPABASE_SERVICE_ROLE_KEY (que ignora RLS);
-- a chave anon do navegador não consegue ler nem gravar estas tabelas.
alter table public.frotas         enable row level security;
alter table public.quadro_colunas enable row level security;
alter table public.quadro_frotas  enable row level security;
alter table public.quadro_meta    enable row level security;
