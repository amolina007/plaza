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
 ) select coalesce(jsonb_agg(to_jsonb(datos) order by nombre),'[]'::jsonb) from datos where auth.uid() is null or (core.revision_acceso_actual() and core.privacidad_acceso_sesion());
$$;
