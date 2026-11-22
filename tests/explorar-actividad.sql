begin;
do $$
declare a uuid; b uuid; sid uuid; cerrada uuid; vacia uuid; r jsonb;
begin
 select id into a from core.perfiles p where core.privacidad_capacidad(id,'comunidad') and not core.revision_inactiva(id) and (select count(*) from core.salas where creada_por=p.id and activa)<5 order by id limit 1;
 select id into b from core.perfiles where id<>a and core.privacidad_capacidad(id,'comunidad') and not core.revision_inactiva(id) order by id limit 1;
 if a is null or b is null then raise exception 'Faltan perfiles de prueba elegibles'; end if;
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 cerrada:=core.plaza_dev_sala_crear('Actividad'||substr(replace(gen_random_uuid()::text,'-',''),1,12),'Prueba de privacidad','Respetar a todos','lectura','aprobacion');
 insert into core.salas(slug,nombre,tipo) values('act'||substr(replace(gen_random_uuid()::text,'-',''),1,15),'Prueba actividad','publica') returning id into sid;
 insert into core.salas(slug,nombre,tipo) values('sin'||substr(replace(gen_random_uuid()::text,'-',''),1,15),'Sin mensajes prueba','publica') returning id into vacia;
 insert into core.sala_mensajes(sala_id,autor_id,cuerpo,creado_en) values
 (sid,a,'Prueba A',now()-interval '1 hour'),(sid,a,'Prueba A2',now()-interval '2 hours'),
 (sid,b,'Prueba B',now()-interval '3 hours'),(sid,b,'Prueba antigua',now()-interval '8 days'),
 (sid,b,'Prueba futura',now()+interval '1 day'),(cerrada,a,'Prueba restringida',now()-interval '2 hours');
 insert into core.sala_mensajes(sala_id,autor_id,cuerpo,creado_en,retirado_en) values(sid,b,'Retirado',now()-interval '1 minute',now());
 insert into core.sala_mensajes(sala_id,autor_id,cuerpo,creado_en,oculto_por_reportes) values(sid,b,'Oculto',now()-interval '1 minute',true);
 perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{}',true);
 set local role anon;
 select x into r from jsonb_array_elements(core.plaza_dev_explorar_actividad()) x where x->>'id'=sid::text;
 if (r->>'activos_7d')::int<>2 or (r->>'mensajes_7d')::int<>3 or (r->>'ultimo_mensaje')::timestamptz<>now()-interval '1 hour' then raise exception 'Conteos o fecha incorrectos: %',r; end if;
 select x into r from jsonb_array_elements(core.plaza_dev_explorar_actividad()) x where x->>'id'=cerrada::text;
 if r is null or (r->>'actividad_visible')::boolean or r->>'activos_7d' is not null or r->>'ultimo_mensaje' is not null then raise exception 'Se expuso actividad restringida'; end if;
 select x into r from jsonb_array_elements(core.plaza_dev_explorar_actividad()) x where x->>'id'=vacia::text;
 if (r->>'activos_7d')::int<>0 or r->>'ultimo_mensaje' is not null then raise exception 'Estado sin datos incorrecto'; end if;
 reset role;
 perform set_config('request.jwt.claim.sub',b::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true);
 set local role authenticated;
 perform core.unirme_a_sala(sid);
 select x into r from jsonb_array_elements(core.plaza_dev_explorar_actividad()) x where x->>'id'=sid::text;
 if not (r->>'soy_miembro')::boolean then raise exception 'Unirse no actualiza estado'; end if;
 perform core.plaza_dev_ingresar(cerrada,true,'Solicito entrar');
 select x into r from jsonb_array_elements(core.plaza_dev_explorar_actividad()) x where x->>'id'=cerrada::text;
 if r->>'solicitud'<>'pendiente' or (r->>'actividad_visible')::boolean then raise exception 'Solicitud expuso actividad'; end if;
 perform set_config('request.jwt.claim.sub',a::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 perform core.plaza_dev_decidir(cerrada,b,'aceptar','Aceptar prueba');
 perform set_config('request.jwt.claim.sub',b::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true);
 select x into r from jsonb_array_elements(core.plaza_dev_explorar_actividad()) x where x->>'id'=cerrada::text;
 if not (r->>'actividad_visible')::boolean or (r->>'activos_7d')::int<>1 then raise exception 'Aprobado no ve actividad'; end if;
 reset role;
end $$;
select 'OK: actividad real, autores únicos, ventana 7 días, retirados/ocultos/futuros, sin datos, privacidad y cambios de ingreso' resultado;
rollback;
