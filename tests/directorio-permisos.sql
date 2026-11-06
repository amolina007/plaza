begin;
-- Test identities are selected server-side and never printed. All writes roll back.
select set_config('plaza.test_sala',(select id::text from core.salas where tipo='privada' and activa and creada_por is not null limit 1),true);
select set_config('plaza.test_owner',(select creada_por::text from core.salas where id=current_setting('plaza.test_sala')::uuid),true);
select set_config('plaza.test_outsider',(select p.id::text from core.perfiles p where p.id<>current_setting('plaza.test_owner')::uuid and not exists(select 1 from core.moderadores m where m.usuario_id=p.id) and not exists(select 1 from core.sala_miembros m where m.usuario_id=p.id and m.sala_id=current_setting('plaza.test_sala')::uuid) limit 1),true);
insert into core.sala_miembros(sala_id,usuario_id) values(current_setting('plaza.test_sala')::uuid,current_setting('plaza.test_owner')::uuid) on conflict do nothing;
set local role anon;
do $$ begin
  if exists(select 1 from core.plaza_dev_directorio() where tipo<>'publica' or puede_editar or soy_miembro) then raise exception 'anon privacy failed'; end if;
  if has_function_privilege('anon','core.plaza_dev_guardar_reglas(uuid,text)','execute') then raise exception 'anon write grant'; end if;
  if has_table_privilege('anon','core.plaza_dev_reglas','select') then raise exception 'direct table access'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('plaza.test_outsider'),true);
set local role authenticated;
do $$ begin
  if exists(select 1 from core.plaza_dev_directorio() where id=current_setting('plaza.test_sala')::uuid) then raise exception 'private room leaked'; end if;
  begin
    perform core.plaza_dev_guardar_reglas(current_setting('plaza.test_sala')::uuid,'unauthorized');
    raise exception 'outsider write allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('plaza.test_owner'),true);
set local role authenticated;
do $$ begin
  if not exists(select 1 from core.plaza_dev_directorio() where id=current_setting('plaza.test_sala')::uuid and puede_editar) then raise exception 'owner access missing'; end if;
  perform core.plaza_dev_guardar_reglas(current_setting('plaza.test_sala')::uuid,'Reglas de prueba transaccional');
  if not exists(select 1 from core.plaza_dev_directorio() where id=current_setting('plaza.test_sala')::uuid and reglas='Reglas de prueba transaccional') then raise exception 'rules save failed'; end if;
  begin
    perform core.plaza_dev_guardar_reglas(current_setting('plaza.test_sala')::uuid,repeat('x',5001));
    raise exception 'length limit missing';
  exception when invalid_parameter_value then null; end;
end $$;
rollback;
select 'PASS: anon, outsider, owner, rule persistence and length; all writes rolled back' as result;
