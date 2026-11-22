create or replace function core.plaza_dev_mod(p_sala uuid) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select coalesce(auth.uid() is not null and (core.revision_acceso_actual() and core.privacidad_acceso_sesion())
 and exists(select 1 from core.plaza_dev_moderadores m join core.salas s on s.id=m.sala_id
 where m.sala_id=p_sala and m.usuario_id=auth.uid() and s.activa
 and not core.sala_expulsado(s.id)),false);
$$;

create or replace function core.plaza_dev_sala_crear(p_nombre text,p_proposito text,p_reglas text,p_categoria text,p_ingreso text) returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
declare sid uuid;
begin
 if auth.uid() is null or not (core.revision_acceso_actual() and core.privacidad_acceso_sesion()) then raise exception 'Inicia sesión con tu cuenta activa.' using errcode='42501'; end if;
 if p_ingreso is null or p_ingreso not in ('abierta','aprobacion','invitacion') or coalesce(length(btrim(p_proposito)),0) not between 3 and 200
 or coalesce(length(btrim(p_reglas)),0) not between 3 and 5000 then raise exception 'Completa propósito, reglas y tipo de ingreso.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
 if (select count(*) from core.salas where creada_por=auth.uid() and activa)>=5 then raise exception 'Ya tienes cinco salas activas.' using errcode='22023'; end if;
 sid:=core.crear_canal(p_nombre,p_proposito);
 -- La sala existe realmente en Core. Restringida impide el ingreso por nombre.
 update core.salas set tipo='restringida' where id=sid;
 insert into core.plaza_dev_salas values(sid,p_ingreso,now());
 insert into core.plaza_dev_moderadores values(sid,auth.uid());
 insert into core.sala_acceso(sala_id,usuario_id) values(sid,auth.uid());
 perform core.plaza_dev_guardar_reglas(sid,p_reglas);
 perform core.plaza_dev_guardar_editorial(sid,p_categoria,null);
 insert into core.plaza_dev_decisiones(sala_id,actor_id,accion,motivo) values(sid,auth.uid(),'crear','Sala creada');
 return sid;
end $$;

create or replace function core.plaza_dev_catalogo() returns jsonb
language sql stable security definer set search_path=pg_catalog as $$
 with ids as (
 select id from core.plaza_dev_directorio()
 union select s.id from core.plaza_dev_salas c join core.salas s on s.id=c.sala_id
 where s.activa and (c.ingreso<>'invitacion' or exists(select 1 from core.plaza_dev_solicitudes q where q.sala_id=s.id and q.usuario_id=auth.uid() and q.estado='invitada') or core.puedo_ver_sala(s.id))
 and (auth.uid() is null or (core.revision_acceso_actual() and core.privacidad_acceso_sesion()))
 and (auth.uid() is null or not core.sala_expulsado(s.id))
 ), datos as (
 select s.id,s.slug,s.nombre,s.descripcion,s.tipo,
 case when s.creada_por is null then 'oficial' else 'usuarios' end origen,
 (select count(*) from core.sala_miembros m where m.sala_id=s.id and not exists(select 1 from core.sala_expulsiones e where e.sala_id=s.id and e.usuario_id=m.usuario_id)) integrantes,
 r.reglas,exists(select 1 from core.sala_miembros m where m.sala_id=s.id and m.usuario_id=auth.uid()) soy_miembro,
 case when c.sala_id is not null then core.plaza_dev_mod(s.id) else s.creada_por=auth.uid() or core.soy_moderador() end puede_editar,
 coalesce(e.categoria,'sin-categoria') categoria,
 case when e.semana=date_trunc('week',now() at time zone 'America/Santiago')::date then e.tema end tema,
 case when e.semana=date_trunc('week',now() at time zone 'America/Santiago')::date and e.tema is not null then e.semana+6 end tema_hasta,
 exists(select 1 from core.plaza_dev_favoritos f where f.sala_id=s.id and f.usuario_id=auth.uid()) favorito,
 c.ingreso,c.sala_id is not null gestionada,
 core.puedo_ver_sala(s.id) puede_entrar,
 (select q.estado from core.plaza_dev_solicitudes q where q.sala_id=s.id and q.usuario_id=auth.uid()) solicitud,
 (select coalesce(jsonb_agg(jsonb_build_object('alias',p.alias) order by p.alias),'[]'::jsonb) from core.plaza_dev_moderadores m join core.perfiles p on p.id=m.usuario_id where m.sala_id=s.id) moderadores
 from ids join core.salas s on s.id=ids.id
 left join core.plaza_dev_salas c on c.sala_id=s.id
 left join core.plaza_dev_reglas r on r.sala_id=s.id
 left join core.plaza_dev_editorial e on e.sala_id=s.id
 ) select coalesce(jsonb_agg(to_jsonb(datos) order by nombre),'[]'::jsonb) from datos;
$$;

create or replace function core.plaza_dev_ingresar(p_sala uuid,p_reglas boolean,p_mensaje text default '') returns text
language plpgsql security definer set search_path=pg_catalog as $$
declare modo text; estado_actual text; actualizado timestamptz;
begin
 if auth.uid() is null or not (core.revision_acceso_actual() and core.privacidad_acceso_sesion()) or not exists(select 1 from core.perfiles where id=auth.uid()) then raise exception 'Inicia sesión y completa tu perfil de Core.' using errcode='42501'; end if;
 if p_reglas is distinct from true or length(coalesce(p_mensaje,''))>300 then raise exception 'Lee y acepta las reglas para continuar.' using errcode='22023'; end if;
 select c.ingreso into modo from core.plaza_dev_salas c join core.salas s on s.id=c.sala_id where s.id=p_sala and s.activa for update of c;
 if modo is null or core.sala_expulsado(p_sala) then raise exception 'Sala no disponible.' using errcode='42501'; end if;
 if core.puedo_ver_sala(p_sala) then
  insert into core.sala_miembros(sala_id,usuario_id) values(p_sala,auth.uid()) on conflict do nothing;
  return 'aceptada';
 end if;
 select estado,actualizado_en into estado_actual,actualizado from core.plaza_dev_solicitudes where sala_id=p_sala and usuario_id=auth.uid();
 if modo='invitacion' and estado_actual is distinct from 'invitada' then raise exception 'Necesitas una invitación.' using errcode='42501'; end if;
 if modo='aprobacion' and estado_actual='rechazada' and actualizado>now()-interval '1 day' then raise exception 'Puedes volver a solicitar ingreso después de 24 horas.' using errcode='22023'; end if;
 if modo='aprobacion' and estado_actual is distinct from 'invitada' then
  insert into core.plaza_dev_solicitudes(sala_id,usuario_id,estado,mensaje) values(p_sala,auth.uid(),'pendiente',btrim(coalesce(p_mensaje,'')))
  on conflict(sala_id,usuario_id) do update set estado='pendiente',mensaje=excluded.mensaje,actualizado_en=now();
  return 'pendiente';
 end if;
 insert into core.sala_acceso(sala_id,usuario_id) values(p_sala,auth.uid()) on conflict do nothing;
 insert into core.sala_miembros(sala_id,usuario_id) values(p_sala,auth.uid()) on conflict do nothing;
 insert into core.plaza_dev_solicitudes(sala_id,usuario_id,estado) values(p_sala,auth.uid(),'aceptada')
 on conflict(sala_id,usuario_id) do update set estado='aceptada',actualizado_en=now();
 return 'aceptada';
end $$;

create or replace function core.plaza_dev_panel(p_sala uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 if not core.plaza_dev_mod(p_sala) then raise exception 'Solo moderadores de esta sala.' using errcode='42501'; end if;
 return jsonb_build_object(
 'solicitudes',(select coalesce(jsonb_agg(jsonb_build_object('id',q.usuario_id,'alias',p.alias,'mensaje',q.mensaje,'estado',q.estado) order by q.actualizado_en),'[]'::jsonb) from core.plaza_dev_solicitudes q join core.perfiles p on p.id=q.usuario_id where q.sala_id=p_sala and q.estado in ('pendiente','invitada')),
 'integrantes',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'alias',p.alias,'moderador',exists(select 1 from core.plaza_dev_moderadores t where t.sala_id=p_sala and t.usuario_id=p.id),'silencio_hasta',x.silencio_hasta) order by p.alias),'[]'::jsonb) from core.sala_miembros m join core.perfiles p on p.id=m.usuario_id left join core.plaza_dev_sanciones x on x.sala_id=m.sala_id and x.usuario_id=m.usuario_id where m.sala_id=p_sala and not exists(select 1 from core.sala_expulsiones e where e.sala_id=p_sala and e.usuario_id=m.usuario_id)),
 'historial',(select coalesce(jsonb_agg(to_jsonb(h) order by h.creado_en desc),'[]'::jsonb) from (select d.accion,d.motivo,d.creado_en,p.alias afectado,a.alias moderador from core.plaza_dev_decisiones d left join core.perfiles p on p.id=d.usuario_id join core.perfiles a on a.id=d.actor_id where d.sala_id=p_sala order by d.creado_en desc,d.id desc limit 50) h));
end $$;

create or replace function core.plaza_dev_decidir(p_sala uuid,p_usuario uuid,p_accion text,p_motivo text) returns void
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if not core.plaza_dev_mod(p_sala) then raise exception 'Solo moderadores de esta sala.' using errcode='42501'; end if;
 if coalesce(length(btrim(p_motivo)),0) not between 3 and 500 then raise exception 'Indica un motivo (3 a 500 caracteres).' using errcode='22023'; end if;
 perform 1 from core.plaza_dev_salas where sala_id=p_sala for update;
 if p_accion in ('aceptar','rechazar') then
  if not exists(select 1 from core.plaza_dev_solicitudes where sala_id=p_sala and usuario_id=p_usuario and estado='pendiente') then raise exception 'La solicitud ya no está pendiente.' using errcode='22023'; end if;
  update core.plaza_dev_solicitudes set estado=case when p_accion='aceptar' then 'aceptada' else 'rechazada' end,actualizado_en=now() where sala_id=p_sala and usuario_id=p_usuario;
  if p_accion='aceptar' then
   if exists(select 1 from core.sala_expulsiones where sala_id=p_sala and usuario_id=p_usuario) then raise exception 'La persona está expulsada.' using errcode='42501'; end if;
   insert into core.sala_acceso(sala_id,usuario_id) values(p_sala,p_usuario) on conflict do nothing;
   insert into core.sala_miembros(sala_id,usuario_id) values(p_sala,p_usuario) on conflict do nothing;
  end if;
 elsif p_accion='invitar' then
  if not exists(select 1 from core.perfiles where id=p_usuario) or exists(select 1 from core.sala_expulsiones where sala_id=p_sala and usuario_id=p_usuario) then raise exception 'Perfil no disponible.' using errcode='42501'; end if;
  insert into core.plaza_dev_solicitudes(sala_id,usuario_id,estado) values(p_sala,p_usuario,'invitada')
  on conflict(sala_id,usuario_id) do update set estado='invitada',actualizado_en=now();
 else
  if exists(select 1 from core.plaza_dev_moderadores where sala_id=p_sala and usuario_id=p_usuario) then raise exception 'No puedes sancionar a un moderador.' using errcode='42501'; end if;
  if not exists(select 1 from core.sala_miembros where sala_id=p_sala and usuario_id=p_usuario) then raise exception 'Integrante no disponible.' using errcode='42501'; end if;
  case p_accion
  when 'advertir' then null;
  when 'silenciar' then insert into core.plaza_dev_sanciones values(p_sala,p_usuario,now()+interval '1 hour') on conflict(sala_id,usuario_id) do update set silencio_hasta=excluded.silencio_hasta;
  when 'habilitar' then delete from core.plaza_dev_sanciones where sala_id=p_sala and usuario_id=p_usuario;
  when 'expulsar' then
   insert into core.sala_expulsiones(sala_id,usuario_id,motivo) values(p_sala,p_usuario,btrim(p_motivo)) on conflict(sala_id,usuario_id) do update set motivo=excluded.motivo,creado_en=now();
   delete from core.sala_acceso where sala_id=p_sala and usuario_id=p_usuario;
   delete from core.sala_miembros where sala_id=p_sala and usuario_id=p_usuario;
   update core.plaza_dev_solicitudes set estado='rechazada',actualizado_en=now() where sala_id=p_sala and usuario_id=p_usuario;
  when 'nombrar' then
   if not exists(select 1 from core.salas where id=p_sala and creada_por=auth.uid()) then raise exception 'Solo quien creó la sala puede nombrar moderadores.' using errcode='42501'; end if;
   insert into core.plaza_dev_moderadores values(p_sala,p_usuario) on conflict do nothing;
  else raise exception 'Acción no válida.' using errcode='22023';
  end case;
 end if;
 insert into core.plaza_dev_decisiones(sala_id,actor_id,usuario_id,accion,motivo) values(p_sala,auth.uid(),p_usuario,p_accion,btrim(p_motivo));
end $$;

create or replace function core.plaza_dev_invitar(p_sala uuid,p_alias text,p_motivo text) returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare uid uuid;
begin
 if not core.plaza_dev_mod(p_sala) then raise exception 'Solo moderadores.' using errcode='42501'; end if;
 select id into uid from core.perfiles where lower(alias)=lower(btrim(p_alias));
 if uid is null then raise exception 'No se encontró ese alias.' using errcode='22023'; end if;
 perform core.plaza_dev_decidir(p_sala,uid,'invitar',p_motivo);
end $$;

create or replace function core.plaza_dev_configurar(p_sala uuid,p_ingreso text,p_reglas text) returns void
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if not core.plaza_dev_mod(p_sala) then raise exception 'Solo moderadores de esta sala.' using errcode='42501'; end if;
 if p_ingreso is null or p_ingreso not in ('abierta','aprobacion','invitacion') or coalesce(length(btrim(p_reglas)),0) not between 3 and 5000 then raise exception 'Completa ingreso y reglas.' using errcode='22023'; end if;
 update core.plaza_dev_salas set ingreso=p_ingreso where sala_id=p_sala;
 insert into core.plaza_dev_reglas(sala_id,reglas) values(p_sala,btrim(p_reglas)) on conflict(sala_id) do update set reglas=excluded.reglas,actualizado_en=now();
 insert into core.plaza_dev_decisiones(sala_id,actor_id,accion,motivo) values(p_sala,auth.uid(),'configurar','Reglas o ingreso actualizados');
end $$;

create or replace function core.plaza_dev_guardia_mensaje() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if exists(select 1 from core.plaza_dev_salas where sala_id=new.sala_id) then
  if not exists(select 1 from core.sala_acceso where sala_id=new.sala_id and usuario_id=new.autor_id)
   or exists(select 1 from core.sala_expulsiones where sala_id=new.sala_id and usuario_id=new.autor_id)
   or exists(select 1 from core.plaza_dev_sanciones where sala_id=new.sala_id and usuario_id=new.autor_id and silencio_hasta>now()) then
   raise exception 'No puedes escribir en esta sala. Revisa tu acceso o el silencio temporal.' using errcode='42501';
  end if;
 end if;
 return new;
end $$;

create or replace function core.plaza_dev_favorito(p_sala_id uuid,p_guardar boolean) returns boolean
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if auth.uid() is null or not (core.revision_acceso_actual() and core.privacidad_acceso_sesion()) then raise exception 'Inicia sesión.' using errcode='42501'; end if;
 if p_guardar is null then raise exception 'Indica si quieres guardar el canal.' using errcode='22023'; end if;
 if p_guardar then
  if not exists(select 1 from jsonb_array_elements(core.plaza_dev_catalogo()) r where r->>'id'=p_sala_id::text) then raise exception 'Sala no disponible.' using errcode='42501'; end if;
  insert into core.plaza_dev_favoritos(usuario_id,sala_id) values(auth.uid(),p_sala_id) on conflict do nothing;
 else delete from core.plaza_dev_favoritos where usuario_id=auth.uid() and sala_id=p_sala_id; end if;
 return p_guardar;
end $$;

create or replace function core.plaza_dev_estado_propio(p_sala uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 if auth.uid() is null or not (core.revision_acceso_actual() and core.privacidad_acceso_sesion()) or not core.puedo_ver_sala(p_sala) or core.sala_expulsado(p_sala) then raise exception 'Sala no disponible.' using errcode='42501'; end if;
 return jsonb_build_object('gestionada',exists(select 1 from core.plaza_dev_salas where sala_id=p_sala),'reglas',(select reglas from core.plaza_dev_reglas where sala_id=p_sala),'moderadores',(select coalesce(jsonb_agg(p.alias),'[]'::jsonb) from core.plaza_dev_moderadores m join core.perfiles p on p.id=m.usuario_id where m.sala_id=p_sala),'silencio_hasta',(select silencio_hasta from core.plaza_dev_sanciones where sala_id=p_sala and usuario_id=auth.uid() and silencio_hasta>now()),
 'avisos',(select coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) from (select accion,motivo,creado_en from core.plaza_dev_decisiones where sala_id=p_sala and usuario_id=auth.uid() and accion in ('advertir','silenciar','habilitar') order by creado_en desc limit 10) d));
end $$;
