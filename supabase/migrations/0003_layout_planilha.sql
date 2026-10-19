-- =====================================================================
-- Polivias · Controle de Frotas — colunas no formato da planilha "PROGRAMAÇÃO FROTAS"
--
--  PORTO ALEGRE › A CAMINHO  : CARREGADOS (a-caminho) | VAZIOS (a-caminho-vazios)
--  PORTO ALEGRE › VOLTANDO   : GUA X URU (voltando)   | TRI X URU (voltando-tri)
--  IMPORTAÇÃO   › URUGUAI    : SALTO (uruguai-imp)    | TREINTA Y TRES (uruguai-treinta)
--
-- Move os blocos existentes para a coluna nova correspondente. Não apaga frotas nem blocos.
-- Rode depois da 0001 e da 0002. Seguro para repetir.
-- =====================================================================

-- 1) colunas novas / títulos
insert into public.quadro_colunas (id, titulo, secao, subtitulo, pais, macros_esperadas, ordem) values
  ('a-caminho-vazios', 'Vazios',                   'status',     'A Caminho',                       null, '{vazio,destinado}',        7),
  ('voltando-tri',     'Tri x Uru',                'status',     'Voltando · Triunfo x Uruguaiana', null, '{vazio,destinado,viagem}', 10),
  ('uruguai-treinta',  'Uruguai · Treinta y Tres', 'importacao', null,                              'UY', '{carga,viagem,descarga}',  13)
on conflict (id) do nothing;

update public.quadro_colunas set titulo = 'Carregados', subtitulo = 'A Caminho', macros_esperadas = '{carga,viagem}' where id = 'a-caminho';
update public.quadro_colunas set titulo = 'Gua x Uru', subtitulo = 'Voltando · Guaíba x Uruguaiana', macros_esperadas = '{vazio,destinado,viagem}' where id = 'voltando';
update public.quadro_colunas set titulo = 'Uruguai · Salto' where id = 'uruguai-imp';

-- 2) blocos para as colunas novas
-- A CAMINHO: blocos "Vazios ..." vão para VAZIOS
update public.quadro_frotas
   set coluna_id = 'a-caminho-vazios',
       rotulo = nullif(trim(regexp_replace(rotulo, '^\s*vazios?\s*-?\s*', '', 'i')), ''),
       macros_esperadas = null
 where coluna_id = 'a-caminho' and rotulo ~* '^\s*vazio';
-- o rótulo "Carregados" virou o título da coluna
update public.quadro_frotas set rotulo = null, macros_esperadas = null
 where coluna_id = 'a-caminho' and rotulo ~* '^\s*carregados?\s*$';

-- VOLTANDO: Triunfo → TRI X URU; rótulos repetidos saem (o título da coluna já diz)
update public.quadro_frotas set coluna_id = 'voltando-tri' where coluna_id = 'voltando' and rotulo ~* '^\s*tri';
update public.quadro_frotas set rotulo = null
 where coluna_id in ('voltando', 'voltando-tri') and rotulo ~* '^\s*(gua[ií]ba|triunfo|gua|tri)\s*(x|/|-)\s*uru';

-- AGUARDANDO CARGA: o rótulo "Porto Alegre" já está no cabeçalho
update public.quadro_frotas set rotulo = null where coluna_id = 'aguardando' and rotulo ~* '^\s*porto\s*alegre\s*$';

-- URUGUAI: Treinta y Tres (CRT 499) → coluna TREINTA Y TRES
update public.quadro_frotas set coluna_id = 'uruguai-treinta'
 where coluna_id = 'uruguai-imp' and (rotulo ~* 'treinta' or crt = '499');

-- 3) ordem das colunas igual à planilha
update public.quadro_colunas c set ordem = o.ordem
  from (values
    ('buenos-aires', 0), ('rosario', 1), ('pilar', 2), ('cordoba', 3), ('zarate', 4), ('santiago-cl', 5),
    ('a-caminho', 6), ('a-caminho-vazios', 7), ('aguardando', 8), ('voltando', 9), ('voltando-tri', 10),
    ('sem-programacao', 11), ('uruguai-imp', 12), ('uruguai-treinta', 13), ('argentina-imp', 14)
  ) as o(id, ordem)
 where c.id = o.id;

notify pgrst, 'reload schema';

select 'OK — quadro no formato da planilha' as resultado;
