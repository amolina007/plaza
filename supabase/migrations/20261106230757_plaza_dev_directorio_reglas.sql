-- Only additive dev objects; existing rooms, messages and memberships are read-only.
create table core.plaza_dev_reglas (
  sala_id uuid primary key references core.salas(id) on delete cascade,
  reglas text not null check (char_length(reglas) <= 5000),
  actualizado_en timestamptz not null default now()
);
alter table core.plaza_dev_reglas enable row level security;
revoke all on core.plaza_dev_reglas from public, anon, authenticated;
-- Intentionally no client table access. Narrow RPCs enforce room access and authorship.
create function core.plaza_dev_directorio()
returns table (id uuid, slug text, nombre text, descripcion text, tipo text,
  origen text, integrantes bigint, reglas text, soy_miembro boolean, puede_editar boolean)
language sql stable security definer set search_path = pg_catalog
as $$
  select s.id,s.slug,s.nombre,s.descripcion,s.tipo,
    case when s.creada_por is null then 'oficial' else 'usuarios' end,
    (select count(*) from core.sala_miembros m where m.sala_id=s.id
      and not exists(select 1 from core.sala_expulsiones e where e.sala_id=m.sala_id and e.usuario_id=m.usuario_id)),
    r.reglas,
    exists(select 1 from core.sala_miembros m where m.sala_id=s.id and m.usuario_id=auth.uid()),
    coalesce(auth.uid() is not null and core.revision_acceso_actual()
      and (s.creada_por=auth.uid() or core.soy_moderador()),false)
  from core.salas s left join core.plaza_dev_reglas r on r.sala_id=s.id
  where s.activa
    and (auth.uid() is null or core.revision_acceso_actual())
    and (s.tipo='publica' or (auth.uid() is not null and core.puedo_ver_sala(s.id)))
    and (auth.uid() is null or not core.sala_expulsado(s.id))
  order by s.nombre,s.id;
$$;
revoke all on function core.plaza_dev_directorio() from public;
grant execute on function core.plaza_dev_directorio() to anon, authenticated;
create function core.plaza_dev_guardar_reglas(p_sala_id uuid,p_reglas text)
returns void language plpgsql security definer set search_path=pg_catalog
as $$
begin
  if auth.uid() is null or not core.revision_acceso_actual() then
    raise exception using errcode='42501', message='Sesión requerida.';
  end if;
  if not exists(select 1 from core.salas s where s.id=p_sala_id and s.activa
    and core.puedo_ver_sala(s.id) and not core.sala_expulsado(s.id)
    and (s.creada_por=auth.uid() or core.soy_moderador())) then
    raise exception using errcode='42501', message='No puedes editar este canal.';
  end if;
  if p_reglas is null or char_length(p_reglas)>5000 then
    raise exception using errcode='22023', message='Las reglas admiten hasta 5000 caracteres.';
  end if;
  insert into core.plaza_dev_reglas(sala_id,reglas) values(p_sala_id,btrim(p_reglas))
  on conflict(sala_id) do update set reglas=excluded.reglas,actualizado_en=now();
end;
$$;
revoke all on function core.plaza_dev_guardar_reglas(uuid,text) from public,anon;
grant execute on function core.plaza_dev_guardar_reglas(uuid,text) to authenticated;
