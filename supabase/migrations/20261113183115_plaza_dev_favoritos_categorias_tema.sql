-- Extensión exclusiva de Plaza dev. No modifica salas ni conversaciones de Core.
create table core.plaza_dev_editorial (
 sala_id uuid primary key references core.salas(id) on delete cascade,
 categoria text not null default 'sin-categoria' check(categoria in ('sin-categoria','vida-cotidiana','musica-baile','mascotas','barrio','lectura','plantas','otros')),
 tema text check(char_length(tema)<=280),
 semana date,
 actualizado_en timestamptz not null default now()
);
create table core.plaza_dev_favoritos (
 usuario_id uuid not null references auth.users(id) on delete cascade,
 sala_id uuid not null references core.salas(id) on delete cascade,
 creado_en timestamptz not null default now(),
 primary key(usuario_id,sala_id)
);
alter table core.plaza_dev_editorial enable row level security;
alter table core.plaza_dev_favoritos enable row level security;
revoke all on core.plaza_dev_editorial, core.plaza_dev_favoritos from public,anon,authenticated;
-- Solo las RPC delimitadas acceden a estas tablas; no se exponen las listas de favoritos.
create function core.plaza_dev_explorar() returns jsonb
language sql stable security definer set search_path=pg_catalog as $$
 select coalesce(jsonb_agg(to_jsonb(d)||jsonb_build_object(
  'categoria',coalesce(e.categoria,'sin-categoria'),
  'tema',case when e.semana=date_trunc('week',now() at time zone 'America/Santiago')::date then e.tema end,
  'tema_hasta',case when e.semana=date_trunc('week',now() at time zone 'America/Santiago')::date and e.tema is not null then e.semana+6 end,
  'favorito',exists(select 1 from core.plaza_dev_favoritos f where f.sala_id=d.id and f.usuario_id=auth.uid())
 ) order by d.nombre),'[]'::jsonb)
 from core.plaza_dev_directorio() d left join core.plaza_dev_editorial e on e.sala_id=d.id;
$$;
revoke all on function core.plaza_dev_explorar() from public;
grant execute on function core.plaza_dev_explorar() to anon,authenticated;
create function core.plaza_dev_favorito(p_sala_id uuid,p_guardar boolean) returns boolean
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if auth.uid() is null or not core.revision_acceso_actual() then raise exception using errcode='42501',message='Inicia sesión para guardar canales.'; end if;
 if p_guardar is null then raise exception using errcode='22023',message='Indica si quieres guardar el canal.'; end if;
 if p_guardar then
  if not exists(select 1 from core.plaza_dev_directorio() where id=p_sala_id) then raise exception using errcode='42501',message='Canal no disponible.'; end if;
  insert into core.plaza_dev_favoritos(usuario_id,sala_id) values(auth.uid(),p_sala_id) on conflict do nothing;
 else
  delete from core.plaza_dev_favoritos where usuario_id=auth.uid() and sala_id=p_sala_id;
 end if;
 return p_guardar;
end;
$$;
revoke all on function core.plaza_dev_favorito(uuid,boolean) from public,anon;
grant execute on function core.plaza_dev_favorito(uuid,boolean) to authenticated;
create function core.plaza_dev_guardar_editorial(p_sala_id uuid,p_categoria text,p_tema text) returns void
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if auth.uid() is null or not core.revision_acceso_actual() or not exists(select 1 from core.plaza_dev_directorio() where id=p_sala_id and puede_editar) then
  raise exception using errcode='42501',message='No puedes editar este canal.';
 end if;
 if p_categoria is null or p_categoria not in ('sin-categoria','vida-cotidiana','musica-baile','mascotas','barrio','lectura','plantas','otros') or char_length(coalesce(p_tema,''))>280 then
  raise exception using errcode='22023',message='Revisa la categoría y el tema (máximo 280 caracteres).';
 end if;
 insert into core.plaza_dev_editorial(sala_id,categoria,tema,semana)
 values(p_sala_id,p_categoria,nullif(btrim(p_tema),''),date_trunc('week',now() at time zone 'America/Santiago')::date)
 on conflict(sala_id) do update set categoria=excluded.categoria,tema=excluded.tema,semana=excluded.semana,actualizado_en=now();
end;
$$;
revoke all on function core.plaza_dev_guardar_editorial(uuid,text,text) from public,anon;
grant execute on function core.plaza_dev_guardar_editorial(uuid,text,text) to authenticated;
-- Clasificación inicial basada en el propósito publicado de las salas oficiales.
insert into core.plaza_dev_editorial(sala_id,categoria)
select id,case when nombre='RitmosAura' then 'musica-baile' when nombre='LadraAura' then 'mascotas' else 'vida-cotidiana' end
from core.salas where tipo='publica' and creada_por is null and nombre in ('RitmosAura','LadraAura','PlazaAura','Chile');
