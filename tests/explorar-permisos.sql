begin;
-- Fixtures transaccionales: no quedan favoritos ni temas de prueba.
do $$ begin
 perform set_config('plaza.test_owner',(select usuario_id::text from core.moderadores limit 1),true);
 perform set_config('plaza.test_other',(select p.id::text from core.perfiles p where not exists(select 1 from core.moderadores m where m.usuario_id=p.id) limit 1),true);
 perform set_config('plaza.test_room',(select id::text from core.salas where activa and tipo='publica' order by nombre limit 1),true);
 if current_setting('plaza.test_owner')='' or current_setting('plaza.test_other')='' then raise exception 'Faltan cuentas de prueba'; end if;
end $$;
set local role anon;
do $$ begin
 if exists(select 1 from jsonb_array_elements(core.plaza_dev_explorar()) r where r->>'tipo'<>'publica' or (r->>'favorito')::boolean) then raise exception 'Filtración anónima'; end if;
 if has_function_privilege('anon','core.plaza_dev_favorito(uuid,boolean)','execute') or has_table_privilege('authenticated','core.plaza_dev_favoritos','select') then raise exception 'Permisos incorrectos'; end if;
end $$;
reset role;
do $$ begin perform set_config('request.jwt.claim.sub',current_setting('plaza.test_owner'),true); end $$;
set local role authenticated;
do $$ begin
 perform core.plaza_dev_favorito(current_setting('plaza.test_room')::uuid,true);
 perform core.plaza_dev_favorito(current_setting('plaza.test_room')::uuid,true);
 if not exists(select 1 from jsonb_array_elements(core.plaza_dev_explorar()) r where r->>'id'=current_setting('plaza.test_room') and (r->>'favorito')::boolean) then raise exception 'Favorito no persistió'; end if;
 perform core.plaza_dev_guardar_editorial(current_setting('plaza.test_room')::uuid,'lectura','Tema de prueba');
 if not exists(select 1 from jsonb_array_elements(core.plaza_dev_explorar()) r where r->>'id'=current_setting('plaza.test_room') and r->>'tema'='Tema de prueba' and r->>'categoria'='lectura' and r->>'tema_hasta' is not null) then raise exception 'Editorial no persistió'; end if;
 begin perform core.plaza_dev_guardar_editorial(current_setting('plaza.test_room')::uuid,'inventada','tema');raise exception 'Categoría inválida admitida';exception when invalid_parameter_value then null;end;
 begin perform core.plaza_dev_guardar_editorial(current_setting('plaza.test_room')::uuid,'lectura',repeat('x',281));raise exception 'Tema demasiado largo';exception when invalid_parameter_value then null;end;
end $$;
reset role;
do $$ begin perform set_config('request.jwt.claim.sub',current_setting('plaza.test_other'),true); end $$;
set local role authenticated;
do $$ begin
 if exists(select 1 from jsonb_array_elements(core.plaza_dev_explorar()) r where (r->>'favorito')::boolean) then raise exception 'Favoritos de otra cuenta expuestos';end if;
 begin perform core.plaza_dev_guardar_editorial(current_setting('plaza.test_room')::uuid,'otros','Ataque');raise exception 'Edición no autorizada';exception when insufficient_privilege then null;end;
 begin perform core.plaza_dev_favorito('00000000-0000-0000-0000-000000000000',true);raise exception 'Sala inexistente admitida';exception when insufficient_privilege then null;end;
end $$;
reset role;
update core.plaza_dev_editorial set semana=semana-7 where sala_id=current_setting('plaza.test_room')::uuid;
do $$ begin perform set_config('request.jwt.claim.sub',current_setting('plaza.test_owner'),true); end $$;
set local role authenticated;
do $$ begin
 if exists(select 1 from jsonb_array_elements(core.plaza_dev_explorar()) r where r->>'id'=current_setting('plaza.test_room') and r->>'tema' is not null) then raise exception 'Tema vencido visible';end if;
 perform core.plaza_dev_favorito(current_setting('plaza.test_room')::uuid,false);
 if exists(select 1 from jsonb_array_elements(core.plaza_dev_explorar()) r where r->>'id'=current_setting('plaza.test_room') and (r->>'favorito')::boolean) then raise exception 'No quitó favorito';end if;
 perform core.plaza_dev_guardar_editorial(current_setting('plaza.test_room')::uuid,'otros','');
 if exists(select 1 from jsonb_array_elements(core.plaza_dev_explorar()) r where r->>'id'=current_setting('plaza.test_room') and r->>'tema' is not null) then raise exception 'No retiró tema';end if;
end $$;
rollback;
select 'PASS: aislamiento de favoritos, persistencia, permisos editoriales, categorías, límite, vencimiento y retiro; rollback completo' as resultado;
