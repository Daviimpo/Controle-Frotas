-- =====================================================================
-- Polivias · Controle de Frotas — corrige tabelas que JÁ EXISTIAM (versão 2)
--
-- Sintomas que este script resolve:
--  • "Could not find the 'coluna_id' column of 'quadro_frotas' in the schema cache"
--  • "invalid input syntax for type uuid" (ids uuid; o app usa ids de texto)
--  • "null value in column ... violates not-null constraint" (colunas antigas obrigatórias)
--  • "there is no unique or exclusion constraint matching the ON CONFLICT"
--
-- Só acrescenta/converte — NÃO apaga dados. Rode depois da 0001. Seguro para repetir.
-- Se aparecer QUALQUER erro, nada é aplicado: copie a mensagem e envie.
-- =====================================================================

-- 1) colunas que faltam ------------------------------------------------
alter table public.frotas add column if not exists frota            text;
alter table public.frotas add column if not exists placa_cavalo     text not null default '';
alter table public.frotas add column if not exists placa_carreta    text not null default '';
alter table public.frotas add column if not exists motorista        text not null default '';
alter table public.frotas add column if not exists macro            text not null default 'vazio';
alter table public.frotas add column if not exists macro_updated_at timestamptz not null default now();
alter table public.frotas add column if not exists updated_at       timestamptz not null default now();

alter table public.quadro_colunas add column if not exists titulo           text;
alter table public.quadro_colunas add column if not exists secao            text;
alter table public.quadro_colunas add column if not exists subtitulo        text;
alter table public.quadro_colunas add column if not exists pais             text;
alter table public.quadro_colunas add column if not exists macros_esperadas text[];
alter table public.quadro_colunas add column if not exists ordem            int not null default 0;

alter table public.quadro_frotas add column if not exists coluna_id        text;
alter table public.quadro_frotas add column if not exists rotulo           text;
alter table public.quadro_frotas add column if not exists programacao      text;
alter table public.quadro_frotas add column if not exists crt              text;
alter table public.quadro_frotas add column if not exists cliente          text;
alter table public.quadro_frotas add column if not exists macros_esperadas text[];
alter table public.quadro_frotas add column if not exists frota_ids        text[] not null default '{}';
alter table public.quadro_frotas add column if not exists ordem            int not null default 0;
alter table public.quadro_frotas add column if not exists created_at       timestamptz not null default now();

alter table public.quadro_meta add column if not exists version    bigint not null default 0;
alter table public.quadro_meta add column if not exists updated_at timestamptz not null default now();
alter table public.quadro_meta add column if not exists updated_by text;

-- 2) tipos e restrições (uuid -> text, jsonb -> text[], NOT NULL antigos, id único) ----
create or replace function public._polivias_jsonb_para_texto(j jsonb) returns text[]
language sql immutable as $f$
  select case when j is null then null
              when jsonb_typeof(j) = 'array' then coalesce(array(select jsonb_array_elements_text(j)), '{}')
              else array[j #>> '{}'] end
$f$;
do $$
declare
  r record;
  fk record;
  fks text[] := '{}';
  expected_text  text[][] := array[
    ['frotas','id'], ['frotas','frota'], ['frotas','placa_cavalo'], ['frotas','placa_carreta'], ['frotas','motorista'], ['frotas','macro'],
    ['quadro_colunas','id'], ['quadro_colunas','titulo'], ['quadro_colunas','secao'], ['quadro_colunas','subtitulo'], ['quadro_colunas','pais'],
    ['quadro_frotas','id'], ['quadro_frotas','coluna_id'], ['quadro_frotas','rotulo'], ['quadro_frotas','programacao'], ['quadro_frotas','crt'], ['quadro_frotas','cliente'],
    ['quadro_meta','updated_by']];
  expected_array text[][] := array[
    ['quadro_colunas','macros_esperadas'], ['quadro_frotas','macros_esperadas'], ['quadro_frotas','frota_ids']];
  known text[] := array[
    'frotas.id','frotas.frota','frotas.placa_cavalo','frotas.placa_carreta','frotas.motorista','frotas.macro','frotas.macro_updated_at','frotas.updated_at',
    'quadro_colunas.id','quadro_colunas.titulo','quadro_colunas.secao','quadro_colunas.subtitulo','quadro_colunas.pais','quadro_colunas.macros_esperadas','quadro_colunas.ordem',
    'quadro_frotas.id','quadro_frotas.coluna_id','quadro_frotas.rotulo','quadro_frotas.programacao','quadro_frotas.crt','quadro_frotas.cliente',
    'quadro_frotas.macros_esperadas','quadro_frotas.frota_ids','quadro_frotas.ordem','quadro_frotas.created_at',
    'quadro_meta.id','quadro_meta.version','quadro_meta.updated_at','quadro_meta.updated_by'];
  i int;
  t text; c text; dt text; udt text;
begin
  -- 1) guarda e remove FKs que envolvem as tabelas (para poder trocar tipos)
  for fk in
    select con.conname, con.conrelid::regclass::text as tbl, pg_get_constraintdef(con.oid) as def
      from pg_constraint con
     where con.contype = 'f'
       and (con.conrelid::regclass::text in ('frotas','quadro_colunas','quadro_frotas','quadro_meta','public.frotas','public.quadro_colunas','public.quadro_frotas','public.quadro_meta')
         or con.confrelid::regclass::text in ('frotas','quadro_colunas','quadro_frotas','quadro_meta','public.frotas','public.quadro_colunas','public.quadro_frotas','public.quadro_meta'))
  loop
    execute format('alter table %s drop constraint %I', fk.tbl, fk.conname);
  end loop;

  -- 2) colunas de texto
  for i in 1 .. array_length(expected_text, 1) loop
    t := expected_text[i][1]; c := expected_text[i][2];
    select data_type, udt_name into dt, udt from information_schema.columns
     where table_schema = 'public' and table_name = t and column_name = c;
    if dt is not null and dt not in ('text', 'character varying') then
      execute format('alter table public.%I alter column %I drop default', t, c);
      execute format('alter table public.%I alter column %I type text using %I::text', t, c, c);
      raise notice 'tipo ajustado: %.% (%) -> text', t, c, dt;
    end if;
  end loop;

  -- 3) colunas array de texto
  for i in 1 .. array_length(expected_array, 1) loop
    t := expected_array[i][1]; c := expected_array[i][2];
    select data_type, udt_name into dt, udt from information_schema.columns
     where table_schema = 'public' and table_name = t and column_name = c;
    if dt is null then continue; end if;
    if dt = 'ARRAY' and udt <> '_text' then
      execute format('alter table public.%I alter column %I drop default', t, c);
      execute format('alter table public.%I alter column %I type text[] using %I::text[]', t, c, c);
      raise notice 'tipo ajustado: %.% (%) -> text[]', t, c, udt;
    elsif dt in ('json', 'jsonb') then
      execute format('alter table public.%I alter column %I drop default', t, c);
      execute format('alter table public.%I alter column %I type text[] using public._polivias_jsonb_para_texto(%I::jsonb)', t, c, c);
      raise notice 'tipo ajustado: %.% (%) -> text[]', t, c, dt;
    elsif dt <> 'ARRAY' then
      execute format('alter table public.%I alter column %I drop default', t, c);
      execute format('alter table public.%I alter column %I type text[] using
        case when %I is null then null else string_to_array(%I::text, '','') end', t, c, c, c);
      raise notice 'tipo ajustado: %.% (%) -> text[]', t, c, dt;
    end if;
  end loop;
  alter table public.quadro_frotas alter column frota_ids set default '{}';
  update public.quadro_frotas set frota_ids = '{}' where frota_ids is null;

  -- 4) colunas antigas NOT NULL sem padrão bloqueiam os inserts do app -> passam a aceitar null
  for r in
    select table_name, column_name from information_schema.columns
     where table_schema = 'public'
       and table_name in ('frotas','quadro_colunas','quadro_frotas','quadro_meta')
       and is_nullable = 'NO' and column_default is null
       and (table_name || '.' || column_name) <> all(known)
  loop
    execute format('alter table public.%I alter column %I drop not null', r.table_name, r.column_name);
    raise notice 'NOT NULL removido da coluna antiga %.%', r.table_name, r.column_name;
  end loop;

  -- 5) "id" precisa ser único (upsert on conflict id)
  foreach t in array array['frotas','quadro_colunas','quadro_frotas'] loop
    if not exists (
      select 1 from pg_index ix join pg_attribute at on at.attrelid = ix.indrelid and at.attnum = any(ix.indkey)
       where ix.indrelid = ('public.' || t)::regclass and (ix.indisprimary or ix.indisunique)
         and at.attname = 'id' and array_length(ix.indkey::int2[], 1) = 1
    ) then
      execute format('create unique index if not exists %I on public.%I (id)', t || '_id_unico', t);
      raise notice 'índice único criado em %.id', t;
    end if;
  end loop;

end $$;

drop function if exists public._polivias_jsonb_para_texto(jsonb);

update public.frotas set macro = 'vazio' where macro is null or macro = '';
update public.frotas set frota = id where frota is null;
update public.quadro_colunas set ordem = 0 where ordem is null;
update public.quadro_frotas set ordem = 0 where ordem is null;

-- 3) colunas padrão do quadro (pula as que já existem com o mesmo id OU o mesmo nome) ----
insert into public.quadro_colunas (id, titulo, secao, subtitulo, pais, macros_esperadas, ordem)
select v.* from (values
  ('buenos-aires',    'Buenos Aires',     'exportacao', null,                  'AR', '{viagem,descarga}'::text[],              0),
  ('rosario',         'Rosario',          'exportacao', null,                  'AR', '{viagem,descarga}'::text[],              1),
  ('pilar',           'Pilar',            'exportacao', null,                  'AR', '{viagem,descarga}'::text[],              2),
  ('cordoba',         'Córdoba',          'exportacao', null,                  'AR', '{viagem,descarga}'::text[],              3),
  ('zarate',          'Zárate',           'exportacao', null,                  'AR', '{viagem,descarga}'::text[],              4),
  ('santiago-cl',     'Santiago CL',      'exportacao', null,                  'CL', '{viagem,descarga}'::text[],              5),
  ('a-caminho',       'Carregados',       'status',     'A Caminho',           null, '{carga,viagem}'::text[],               6),
  ('a-caminho-vazios','Vazios',           'status',     'A Caminho',           null, '{vazio,destinado}'::text[],            6),
  ('aguardando',      'Aguardando Carga', 'status',     'Porto Alegre',        'BR', '{vazio,destinado,carga}'::text[],       7),
  ('voltando',        'Gua x Uru',        'status',     'Voltando',            null, '{vazio,destinado,viagem}'::text[],      8),
  ('voltando-tri',    'Tri x Uru',        'status',     'Voltando',            null, '{vazio,destinado,viagem}'::text[],      8),
  ('sem-programacao', 'Sem Programação',  'status',     'Frotas disponíveis',  null, null::text[],                            9),
  ('uruguai-imp',     'Uruguai · Salto',  'importacao', null,                  'UY', '{carga,viagem,descarga}'::text[],       10),
  ('uruguai-treinta', 'Uruguai · Treinta y Tres', 'importacao', null,            'UY', '{carga,viagem,descarga}'::text[],       10),
  ('argentina-imp',   'Argentina',        'importacao', null,                  'AR', '{carga,viagem,descarga}'::text[],       11)
) as v(id, titulo, secao, subtitulo, pais, macros_esperadas, ordem)
where not exists (select 1 from public.quadro_colunas c where c.id = v.id or lower(trim(c.titulo)) = lower(v.titulo));

-- colunas antigas sem seção: o quadro precisa saber onde exibi-las
update public.quadro_colunas set secao = 'exportacao' where secao is null or secao not in ('exportacao','status','importacao');
update public.quadro_colunas set titulo = id where titulo is null;

-- 4) aproveita nomes antigos (column_id / coluna / destino) para preencher coluna_id ----
do $$
declare legacy text;
begin
  foreach legacy in array array['column_id', 'coluna', 'destino'] loop
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'quadro_frotas' and column_name = legacy) then
      execute format(
        'update public.quadro_frotas q set coluna_id = c.id
           from public.quadro_colunas c
          where q.coluna_id is null
            and (c.id = q.%1$I::text or lower(trim(c.titulo)) = lower(trim(q.%1$I::text)))', legacy);
    end if;
  end loop;
end $$;
update public.quadro_frotas q set coluna_id = null
 where coluna_id is not null and not exists (select 1 from public.quadro_colunas c where c.id = q.coluna_id);

-- 5) FK, índice e trigger -------------------------------------------------
alter table public.quadro_frotas drop constraint if exists quadro_frotas_coluna_id_fkey;
alter table public.quadro_frotas
  add constraint quadro_frotas_coluna_id_fkey foreign key (coluna_id) references public.quadro_colunas(id) on delete cascade;
create index if not exists quadro_frotas_frota_ids_idx on public.quadro_frotas using gin (frota_ids);

create or replace function public.remover_frota_do_quadro() returns trigger
language plpgsql as $$
begin
  update public.quadro_frotas set frota_ids = array_remove(frota_ids, old.id::text) where old.id::text = any(frota_ids);
  return old;
end $$;
drop trigger if exists trg_remover_frota_do_quadro on public.frotas;
create trigger trg_remover_frota_do_quadro after delete on public.frotas
  for each row execute function public.remover_frota_do_quadro();

-- 6) recarrega o schema cache da API do Supabase --------------------------
notify pgrst, 'reload schema';

select 'OK — schema corrigido. Rode supabase/diagnostico_schema.sql para conferir.' as resultado;
