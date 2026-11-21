
begin;
do $$
declare ids uuid[]:=array[]::uuid[]; perfil uuid; otro uuid; sid uuid; i int; j int;
 fecha date:=(now() at time zone 'America/Santiago')::date-2; dia_inicio timestamptz; datos jsonb;
begin
 select id into perfil from core.perfiles order by id limit 1;
 select id into otro from core.perfiles where id<>perfil order by id limit 1;
 dia_inicio:=fecha::timestamp at time zone 'America/Santiago';
 for i in 1..5 loop
  insert into core.salas(slug,nombre,tipo,activa,numero) values(
   'plazatest'||replace(gen_random_uuid()::text,'-','')::varchar(16),'Prueba resumen '||i,
   case when i=5 then 'privada' else 'publica' end,true,(select coalesce(max(numero),0)+1 from core.salas)) returning id into sid;
  ids:=array_append(ids,sid);
  for j in 1..case when i=5 then 30 else 7-i end loop
   insert into core.sala_mensajes(sala_id,autor_id,cuerpo,creado_en) values(sid,
    case when j%2=0 then otro else perfil end,'Fixture transaccional',
    (fecha::timestamp + make_interval(hours=>case when j<=3 then 9 else 18 end)) at time zone 'America/Santiago');
  end loop;
 end loop;
 -- Un mensaje retirado y otro oculto no deben contar.
 insert into core.sala_mensajes(sala_id,autor_id,cuerpo,creado_en,retirado_en)
 values(ids[1],perfil,'Retirado',dia_inicio+interval '1 hour',now());
 insert into core.sala_mensajes(sala_id,autor_id,cuerpo,creado_en,oculto_por_reportes)
 values(ids[1],perfil,'Oculto',dia_inicio+interval '1 hour',true);
 -- Límites: la medianoche siguiente pertenece al día siguiente.
 insert into core.sala_mensajes(sala_id,autor_id,cuerpo,creado_en)
 values(ids[1],perfil,'Otro día',(fecha+1)::timestamp at time zone 'America/Santiago');
 if not core.plaza_dev_generar_resumen(fecha) then raise exception 'No se generó'; end if;
 if core.plaza_dev_generar_resumen(fecha) then raise exception 'Duplicado'; end if;
 select canales into datos from core.plaza_dev_resumenes where dia=fecha;
 if jsonb_array_length(datos)<>3 or (datos->0->>'mensajes')::int<>6
 or (datos->0->>'participantes')::int<>2 or (datos->0->>'hora_peak')::int<>9
 or (datos->0->>'mensajes_peak')::int<>3
 or (datos->1->>'mensajes')::int<>5 or (datos->2->>'mensajes')::int<>4 then
  raise exception 'Ranking/conteos/peak incorrectos: %',datos;
 end if;
 -- Un canal que deja de ser público tampoco se expone en resúmenes anteriores.
 update core.salas set tipo='privada' where id=ids[1];
 if exists(select 1 from jsonb_array_elements(core.plaza_dev_feed(100)) p,
  jsonb_array_elements(p->'canales') c where c->>'sala_id'=ids[1]::text) then raise exception 'Canal privado visible'; end if;
 begin
  perform core.plaza_dev_generar_resumen((now() at time zone 'America/Santiago')::date);
  raise exception 'Aceptó día abierto';
 exception when invalid_parameter_value then null; end;
 if has_function_privilege('anon','core.plaza_dev_generar_resumen(date)','execute')
 or has_function_privilege('authenticated','core.plaza_dev_cierre_diario()','execute')
 or has_table_privilege('authenticated','core.plaza_dev_resumenes','select') then raise exception 'Permisos excesivos'; end if;
end $$;
set local role anon;
select jsonb_array_length(core.plaza_dev_feed(10))>=1 as lectura_anon_ok;
rollback;

