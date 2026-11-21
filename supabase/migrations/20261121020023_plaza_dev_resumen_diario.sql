
create table core.plaza_dev_resumenes (
 id uuid primary key default gen_random_uuid(),
 dia date not null unique,
 publicado_en timestamptz not null default now(),
 canales jsonb not null check(jsonb_typeof(canales)='array')
);
alter table core.plaza_dev_resumenes enable row level security;
revoke all on core.plaza_dev_resumenes from public,anon,authenticated;

-- Solo el programador/operador puede generar cierres. Día cerrado en Chile.
create function core.plaza_dev_generar_resumen(p_dia date) returns boolean
language plpgsql security definer set search_path=pg_catalog as $$
declare resultado jsonb; filas integer;
begin
 if p_dia is null or p_dia >= (now() at time zone 'America/Santiago')::date then
  raise exception 'El resumen requiere un día cerrado' using errcode='22023';
 end if;
 with mensajes as materialized (
  select m.sala_id,m.autor_id,extract(hour from m.creado_en at time zone 'America/Santiago')::int hora
  from core.sala_mensajes m join core.salas s on s.id=m.sala_id
  where s.activa and s.tipo='publica' and m.retirado_en is null
   and not coalesce(m.oculto_por_reportes,false)
   and m.creado_en >= (p_dia::timestamp at time zone 'America/Santiago')
   and m.creado_en < ((p_dia+1)::timestamp at time zone 'America/Santiago')
 ), totales as (
  select sala_id,count(*) mensajes,count(distinct autor_id) participantes from mensajes
  group by sala_id order by count(*) desc,count(distinct autor_id) desc,sala_id limit 3
 ), horas as (
  select sala_id,hora,count(*) cantidad from mensajes group by sala_id,hora
 ), pico as (
  select distinct on(sala_id) sala_id,hora,cantidad from horas order by sala_id,cantidad desc,hora
 )
 select coalesce(jsonb_agg(jsonb_build_object('sala_id',t.sala_id,'mensajes',t.mensajes,
  'participantes',t.participantes,'hora_peak',p.hora,'mensajes_peak',p.cantidad)
  order by t.mensajes desc,t.participantes desc,t.sala_id),'[]'::jsonb)
 into resultado from totales t join pico p using(sala_id);
 insert into core.plaza_dev_resumenes(dia,canales) values(p_dia,resultado) on conflict(dia) do nothing;
 get diagnostics filas=row_count;
 return filas=1;
end $$;
revoke all on function core.plaza_dev_generar_resumen(date) from public,anon,authenticated;

create function core.plaza_dev_cierre_diario() returns integer
language plpgsql security definer set search_path=pg_catalog as $$
declare fecha date; inicio date; ayer date := (now() at time zone 'America/Santiago')::date-1; cantidad integer:=0;
begin
 perform pg_advisory_xact_lock(hashtext('plaza-dev-cierre'));
 select coalesce(max(dia)+1,ayer) into inicio from core.plaza_dev_resumenes;
 -- Recupera hasta siete días pendientes por ejecución, sin duplicados.
 for fecha in select generate_series(inicio::timestamp,least(inicio+6,ayer)::timestamp,'1 day')::date loop
  if core.plaza_dev_generar_resumen(fecha) then cantidad:=cantidad+1; end if;
 end loop;
 return cantidad;
end $$;
revoke all on function core.plaza_dev_cierre_diario() from public,anon,authenticated;

create function core.plaza_dev_feed(p_limite integer default 30) returns jsonb
language sql stable security definer set search_path=pg_catalog as $$
 with pagina as (
  select * from core.plaza_dev_resumenes order by dia desc limit least(greatest(coalesce(p_limite,30),1),100)
 ), permitidos as (
  select r.id,r.dia,r.publicado_en,
   coalesce(jsonb_agg(c.item || jsonb_build_object('nombre',s.nombre,'slug',s.slug)
    order by c.orden) filter(where s.id is not null),'[]'::jsonb) canales,
   jsonb_array_length(r.canales) original
  from pagina r
  left join lateral jsonb_array_elements(r.canales) with ordinality c(item,orden) on true
  left join core.salas s on s.id=(c.item->>'sala_id')::uuid and s.activa and s.tipo='publica'
    and (auth.uid() is null or not core.sala_expulsado(s.id))
  group by r.id,r.dia,r.publicado_en,r.canales
 ), publicaciones as (
  select id,dia,publicado_en,canales,
   case when original=0 then 'No hubo mensajes en canales públicos durante este día.'
    when jsonb_array_length(canales)=0 then 'Los canales de este resumen ya no están disponibles.'
    else (select string_agg(format('%s. %s: %s mensajes · %s participantes · hora peak %s:00–%s:00 (%s mensajes).',
     n,x->>'nombre',x->>'mensajes',x->>'participantes',
     lpad(x->>'hora_peak',2,'0'),lpad((((x->>'hora_peak')::int+1)%24)::text,2,'0'),x->>'mensajes_peak'),E'\n' order by n)
     from jsonb_array_elements(canales) with ordinality v(x,n))
   end || E'\nParticipantes: personas distintas que escribieron. Hora de Chile (America/Santiago). En empates horarios se muestra la primera franja.' texto
  from permitidos
 )
 select coalesce(jsonb_agg(jsonb_build_object(
  'sitio','plaza','publicacion_id',id,'titulo','Actividad de canales · '||to_char(dia,'DD/MM/YYYY'),
  'texto',texto,'fecha',publicado_en,'tipo','resumen diario','dia',dia,'canales',canales,
  'centro_nombre','Plaza Aura') order by dia desc),'[]'::jsonb) from publicaciones
 where auth.uid() is null or core.revision_acceso_actual();
$$;
revoke all on function core.plaza_dev_feed(integer) from public;
grant execute on function core.plaza_dev_feed(integer) to anon,authenticated;

-- Reintento horario: el primer cierre es a las 00:10 de Chile.
-- La fecha local determina el corte también cuando cambia el horario de verano.
select cron.schedule('plaza-dev-resumen-diario','10 * * * *','select core.plaza_dev_cierre_diario();');
select core.plaza_dev_cierre_diario();

