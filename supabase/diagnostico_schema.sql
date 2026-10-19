-- =====================================================================
-- Polivias · DIAGNÓSTICO do schema (somente leitura — não altera nada)
-- Cole no SQL Editor do Supabase e rode. Toda linha com "problema"
-- explica por que a gravação do quadro falha.
-- =====================================================================
with esperado(tabela, coluna, tipo) as (values
  ('frotas','id','text'), ('frotas','frota','text'), ('frotas','placa_cavalo','text'),
  ('frotas','placa_carreta','text'), ('frotas','motorista','text'), ('frotas','macro','text'),
  ('frotas','macro_updated_at','timestamp with time zone'), ('frotas','updated_at','timestamp with time zone'),
  ('quadro_colunas','id','text'), ('quadro_colunas','titulo','text'), ('quadro_colunas','secao','text'),
  ('quadro_colunas','subtitulo','text'), ('quadro_colunas','pais','text'), ('quadro_colunas','macros_esperadas','text[]'),
  ('quadro_colunas','ordem','integer'),
  ('quadro_frotas','id','text'), ('quadro_frotas','coluna_id','text'), ('quadro_frotas','rotulo','text'),
  ('quadro_frotas','programacao','text'), ('quadro_frotas','crt','text'), ('quadro_frotas','cliente','text'),
  ('quadro_frotas','macros_esperadas','text[]'), ('quadro_frotas','frota_ids','text[]'), ('quadro_frotas','ordem','integer'),
  ('quadro_frotas','created_at','timestamp with time zone'),
  ('quadro_meta','id','integer'), ('quadro_meta','version','bigint'),
  ('quadro_meta','updated_at','timestamp with time zone'), ('quadro_meta','updated_by','text')
),
atual as (
  select c.table_name as tabela, c.column_name as coluna,
         case when c.data_type = 'ARRAY' then regexp_replace(c.udt_name, '^_', '') || '[]'
              when c.data_type = 'USER-DEFINED' then c.udt_name else c.data_type end as tipo,
         c.is_nullable = 'NO' as obrigatoria, c.column_default as padrao
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name in ('frotas','quadro_colunas','quadro_frotas','quadro_meta')
)
select coalesce(e.tabela, a.tabela) as tabela,
       coalesce(e.coluna, a.coluna) as coluna,
       a.tipo as tipo_atual,
       e.tipo as tipo_esperado,
       case
         when a.coluna is null then 'FALTA a coluna (rode 0002)'
         when e.coluna is null and a.obrigatoria and a.padrao is null then 'coluna extra NOT NULL sem padrão: bloqueia inserts (rode 0002)'
         when e.coluna is not null and replace(a.tipo, 'text[]', 'text[]') <> e.tipo
              and not (e.tipo = 'text' and a.tipo = 'character varying')
              and not (e.tipo = 'text[]' and a.tipo = 'varchar[]')
              and not (e.tipo = 'integer' and a.tipo in ('bigint','smallint'))
              and not (e.tipo = 'bigint' and a.tipo = 'integer')
           then 'tipo diferente (rode 0002)'
         else null
       end as problema
  from esperado e
  full join atual a on a.tabela = e.tabela and a.coluna = e.coluna
 order by problema nulls last, tabela, coluna;

-- Chaves: upsert precisa de PRIMARY KEY/UNIQUE em "id"
select t.relname as tabela,
       exists (select 1 from pg_index i join pg_attribute at on at.attrelid = i.indrelid and at.attnum = any(i.indkey)
                where i.indrelid = t.oid and (i.indisprimary or i.indisunique) and at.attname = 'id'
                  and array_length(i.indkey::int2[], 1) = 1) as id_unico
  from pg_class t join pg_namespace n on n.oid = t.relnamespace
 where n.nspname = 'public' and t.relname in ('frotas','quadro_colunas','quadro_frotas','quadro_meta');
