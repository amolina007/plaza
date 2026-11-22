create function core.plaza_dev_explorar_actividad() returns jsonb
language sql stable security definer set search_path=pg_catalog as $$
 with catalogo as materialized (
  select r, (r->>'tipo'='publica' or coalesce((r->>'puede_entrar')::boolean,false)) permitida
  from jsonb_array_elements(core.plaza_dev_catalogo()) r
 ), datos as (
  select c.r,c.permitida,a.activos_7d,a.mensajes_7d,a.ultimo_mensaje
  from catalogo c left join lateral (
   select count(distinct m.autor_id) filter(where m.creado_en>=now()-interval '7 days') activos_7d,
    count(*) filter(where m.creado_en>=now()-interval '7 days') mensajes_7d,
    max(m.creado_en) ultimo_mensaje
   from core.sala_mensajes m
   where c.permitida and m.sala_id=(c.r->>'id')::uuid and m.retirado_en is null
    and not coalesce(m.oculto_por_reportes,false) and m.creado_en<=now()
  ) a on c.permitida
 )
 select coalesce(jsonb_agg(r || jsonb_build_object(
  'actividad_visible',permitida,
  'activos_7d',case when permitida then activos_7d end,
  'mensajes_7d',case when permitida then mensajes_7d end,
  'ultimo_mensaje',case when permitida then ultimo_mensaje end
 ) order by r->>'nombre'),'[]'::jsonb) from datos;
$$;
revoke all on function core.plaza_dev_explorar_actividad() from public;
grant execute on function core.plaza_dev_explorar_actividad() to anon,authenticated;
comment on function core.plaza_dev_explorar_actividad() is 'Catálogo dev con actividad agregada. Excluye mensajes retirados/ocultos/futuros. Actividad restringida solo con acceso. Activos: autores distintos en 7 días móviles.';

