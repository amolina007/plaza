(() => {
  'use strict';
  const client=window.auraClient, db=client?.schema('core');
  if(!db || !window.PlazaConfig?.dev)return;
  const $=id=>document.getElementById(id);
  const node=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n;};
  const btn=(text,action,cls='btn btn-ghost')=>{const b=node('button',text,cls);b.type='button';b.addEventListener('click',action);return b;};
  const status=(id,text)=>{$(id).textContent=text;};
  const modos={abierta:'Ingreso abierto',aprobacion:'Ingreso con aprobación',invitacion:'Por invitación'};
  let uid,version=0,panelVersion=0,sala=null,pendiente=null,tab='solicitudes';
  const login=()=>{if(!$('acceso-dialogo').open)$('acceso-dialogo').showModal();};
  const cambiar=()=>window.dispatchEvent(new Event('plaza:salas-cambio'));
  const visible=v=>window.PlazaVistas.mostrar(v,{actualizarHash:true});
  async function rpc(nombre,args={}) {const r=await db.rpc(nombre,args);if(r.error)throw Error(r.error.message||'No se pudo completar la acción.');return r.data;}
  const mensajeError=e=>e?.message||'No se pudo completar la acción. Vuelve a intentar.';
  function enlaceChat(row){const a=node('a','Abrir chat en Core →','btn btn-primary');a.href=`${window.PlazaConfig.core}/chats.html?sala=${encodeURIComponent(row.slug)}`;return a;}
  function actualizarCuenta(sesion){const id=sesion?.user?.id||null;if(id===uid)return;uid=id;version++;sala=null;pendiente=null;$('sala-detalle').replaceChildren();$('moderacion-panel').replaceChildren();$('decision-dialogo').close();$('crear-sala-form').reset();['sala-estado','moderacion-estado','crear-sala-estado'].forEach(id=>status(id,''));if(!document.getElementById('sala').hidden||!document.getElementById('moderacion').hidden)visible('explorar');}
  client.auth.onAuthStateChange((_e,s)=>actualizarCuenta(s));
  const listo=client.auth.getSession().then(({data})=>actualizarCuenta(data.session));
  window.PlazaDirectory.categories.filter(c=>c[0]!=='sin-categoria').forEach(([id,label])=>{const o=node('option',label);o.value=id;$('crear-sala-form').elements.categoria.append(o);});
  $('crear-sala-form').addEventListener('submit',async e=>{
    e.preventDefault();const f=e.currentTarget;await listo;if(!uid){status('crear-sala-estado','Inicia sesión para crear tu sala.');login();return;}
    const b=f.querySelector('[type=submit]'),turn=version;b.disabled=true;status('crear-sala-estado','Creando sala…');
    try{const id=await rpc('plaza_dev_sala_crear',{p_nombre:f.elements.nombre.value,p_proposito:f.elements.proposito.value,p_categoria:f.elements.categoria.value,p_reglas:f.elements.reglas.value,p_ingreso:f.elements.ingreso.value});if(turn!==version)return;const rows=await rpc('plaza_dev_catalogo');if(turn!==version)return;const row=rows.find(r=>r.id===id);f.reset();cambiar();if(row)abrir(row);else status('crear-sala-estado','Sala creada. Actualiza el directorio para verla.');}catch(e){if(turn===version)status('crear-sala-estado',mensajeError(e));}finally{b.disabled=false;}
  });
  async function recargarFila(id){const rows=await rpc('plaza_dev_catalogo');return rows.find(r=>r.id===id);}
  function abrir(row){
    sala=row;const turn=version;visible('sala');status('sala-estado','');const box=$('sala-detalle');box.replaceChildren();
    const cab=node('div','','panel room-summary');cab.append(node('h3',row.nombre),node('p',row.descripcion||'Esta sala todavía no tiene propósito publicado.'),node('span',row.gestionada?modos[row.ingreso]:row.tipo==='publica'?'Sala pública':'Sala con acceso','tag'),node('p',`${row.integrantes} integrantes`));
    const mods=(row.moderadores||[]).map(m=>m.alias);cab.append(node('p',mods.length?`Moderación: ${mods.join(', ')}`:row.origen==='oficial'?'Moderación general de Core':'Administración del canal en Core','room-moderators'));
    const rules=node('div','','panel room-rules');rules.append(node('h3','Reglas'),node('p',row.reglas||'Se aplican las normas generales de Convergencia.'));
    const generales=node('a','Leer normas generales');generales.href=`${window.PlazaConfig.core}/normas-chats.html`;rules.append(generales);box.append(cab,rules);
    if(row.gestionada && row.puede_editar)box.append(btn('Administrar sala',()=>moderar(sala),'btn btn-primary'));
    if(!row.gestionada || row.puede_entrar){box.append(enlaceChat(row));if(uid&&row.gestionada)rpc('plaza_dev_estado_propio',{p_sala:row.id}).then(d=>{if(turn!==version||sala?.id!==row.id)return;const avisos=node('div','','room-notices');if(d.silencio_hasta)avisos.append(node('p',`Silencio temporal hasta ${new Date(d.silencio_hasta).toLocaleString('es-CL')}.`));(d.avisos||[]).forEach(a=>avisos.append(node('p',`${a.accion}: ${a.motivo}`)));box.append(avisos);}).catch(()=>{});return;}
    if(row.solicitud==='pendiente'){box.append(node('p','Tu solicitud está pendiente. El equipo de moderación revisará tu ingreso.','panel'));return;}
    const form=node('form','','panel room-form');const label=node('label','','room-checkbox'),check=node('input');check.type='checkbox';check.required=true;label.append(check,document.createTextNode('Leí y acepto las reglas de la sala'));
    const motivo=node('label','Cuéntanos por qué quieres participar (opcional)'),input=node('textarea');input.maxLength=300;motivo.append(input);
    const submit=node('button',row.ingreso==='aprobacion'&&row.solicitud!=='invitada'?'Solicitar ingreso':'Unirme a la sala','btn btn-primary');submit.type='submit';form.append(label,motivo,submit);box.append(form);
    form.addEventListener('submit',async e=>{e.preventDefault();if(!uid){login();return;}submit.disabled=true;try{const resultado=await rpc('plaza_dev_ingresar',{p_sala:row.id,p_reglas:check.checked,p_mensaje:input.value});if(turn!==version)return;const nueva=await recargarFila(row.id);if(turn!==version)return;cambiar();if(nueva)abrir(nueva);status('sala-estado',resultado==='pendiente'?'Solicitud enviada.':'Ya puedes abrir el chat en Core.');}catch(e){if(turn===version)status('sala-estado',mensajeError(e));}finally{submit.disabled=false;}});
  }
  function formularioAccion(row,persona,accion){pendiente={sala:row.id,usuario:persona.id,accion};$('decision-titulo').textContent=`${({aceptar:'Aceptar',rechazar:'Rechazar',advertir:'Advertir a',silenciar:'Silenciar por una hora a',habilitar:'Quitar silencio a',expulsar:'Expulsar a',nombrar:'Nombrar moderador a'})[accion]} ${persona.alias}`;$('decision-form').reset();status('decision-estado','');$('decision-dialogo').showModal();}
  $('decision-cancelar').onclick=()=>{$('decision-dialogo').close();pendiente=null;};
  $('decision-form').addEventListener('submit',async e=>{e.preventDefault();const decision=pendiente;if(!decision)return;const b=e.currentTarget.querySelector('[type=submit]'),turn=version;b.disabled=true;try{await rpc('plaza_dev_decidir',{p_sala:decision.sala,p_usuario:decision.usuario,p_accion:decision.accion,p_motivo:e.currentTarget.elements.motivo.value});if(turn!==version)return;$('decision-dialogo').close();pendiente=null;cambiar();await moderar(sala,false);status('moderacion-estado','Decisión guardada.');}catch(e){if(turn===version)status('decision-estado',mensajeError(e));}finally{b.disabled=false;}});
  $('moderacion-volver').onclick=async()=>{const turn=version;if(sala){const nueva=await recargarFila(sala.id).catch(()=>null);if(turn===version&&nueva)abrir(nueva);}else visible('explorar');};
  async function moderar(row,navegar=true){
    if(!row)return;if(!uid){login();return;}sala=row;const turn=version,id=row.id,panelTurn=++panelVersion;if(navegar){tab='solicitudes';visible('moderacion');}status('moderacion-estado','Cargando…');$('moderacion-panel').replaceChildren();
    try{const datos=await rpc('plaza_dev_panel',{p_sala:id});if(turn!==version||sala?.id!==id||panelTurn!==panelVersion)return;status('moderacion-estado','');const box=$('moderacion-panel');box.append(node('h3',row.nombre));const tabs=node('div','','room-tabs');[['solicitudes','Solicitudes'],['integrantes','Integrantes'],['reglas','Reglas y acceso'],['historial','Historial']].forEach(([key,label])=>{const b=btn(label,()=>{tab=key;moderar(sala,false);});b.setAttribute('aria-pressed',String(tab===key));tabs.append(b);});box.append(tabs);
      if(tab==='solicitudes'){
        if(!datos.solicitudes.length)box.append(node('p','No hay solicitudes pendientes.'));
        datos.solicitudes.forEach(p=>{const card=node('article','','panel room-person');card.append(node('h4',p.alias),node('p',p.mensaje),node('small',p.estado==='invitada'?'Invitación enviada · falta aceptación':'Solicitud pendiente'));if(p.estado==='pendiente'){const acciones=node('div','','card-actions');acciones.append(btn('Aceptar',()=>formularioAccion(row,p,'aceptar'),'btn btn-primary'),btn('Rechazar',()=>formularioAccion(row,p,'rechazar')));card.append(acciones);}box.append(card);});
        const form=node('form','','panel room-form'),l=node('label','Invitar por alias de Core'),a=node('input');a.name='alias';a.required=true;a.maxLength=40;l.append(a);const m=node('label','Motivo de la invitación'),t=node('input');t.name='motivo';t.required=true;t.minLength=3;t.maxLength=500;m.append(t);const enviar=node('button','Enviar invitación','btn btn-primary');enviar.type='submit';form.append(node('h4','Invitar a una persona'),l,m,enviar);box.append(form);
        form.onsubmit=async e=>{e.preventDefault();enviar.disabled=true;try{await rpc('plaza_dev_invitar',{p_sala:id,p_alias:a.value.replace(/^@/,''),p_motivo:t.value});if(turn!==version)return;await moderar(sala,false);status('moderacion-estado','Invitación guardada. La persona la verá al iniciar sesión en Plaza.');}catch(e){if(turn===version)status('moderacion-estado',mensajeError(e));}finally{enviar.disabled=false;}};
      }
      if(tab==='integrantes')datos.integrantes.forEach(p=>{const card=node('article','','panel room-person');card.append(node('h4',p.alias),node('span',p.moderador?'Moderador':'Integrante','tag'));if(p.silencio_hasta&&new Date(p.silencio_hasta)>new Date())card.append(node('p',`Silencio hasta ${new Date(p.silencio_hasta).toLocaleString('es-CL')}`));if(!p.moderador){const acciones=node('div','','card-actions');[['advertir','Advertir'],['silenciar','Silenciar 1 h'],['habilitar','Quitar silencio'],['expulsar','Expulsar'],['nombrar','Nombrar moderador']].forEach(([a,t])=>acciones.append(btn(t,()=>formularioAccion(row,p,a))));card.append(acciones);}box.append(card);});
      if(tab==='reglas'){
        const f=node('form','','panel room-form'),l=node('label','Reglas de la sala'),text=node('textarea');text.required=true;text.minLength=3;text.maxLength=5000;text.rows=7;text.value=row.reglas||'';l.append(text);const l2=node('label','Ingreso'),select=node('select');Object.entries(modos).forEach(([key,t])=>{const o=node('option',t);o.value=key;select.append(o);});select.value=row.ingreso;l2.append(select);const b=node('button','Guardar reglas y acceso','btn btn-primary');b.type='submit';f.append(l,l2,node('p','Cambiar el ingreso afecta a las nuevas incorporaciones. Los integrantes actuales conservan su acceso.','muted'),b);box.append(f);
        f.onsubmit=async e=>{e.preventDefault();b.disabled=true;try{await rpc('plaza_dev_configurar',{p_sala:id,p_ingreso:select.value,p_reglas:text.value});if(turn!==version)return;const nueva=await recargarFila(id);if(turn!==version)return;sala=nueva;cambiar();await moderar(sala,false);status('moderacion-estado','Reglas y acceso guardados.');}catch(e){if(turn===version)status('moderacion-estado',mensajeError(e));}finally{b.disabled=false;}};
      }
      if(tab==='historial'){box.append(node('p','Últimas 50 decisiones. Los motivos solo son visibles para los moderadores y, en sus avisos personales, para la persona afectada.'));datos.historial.forEach(d=>{const card=node('article','','panel room-person');card.append(node('strong',`${d.accion}${d.afectado?` · ${d.afectado}`:''}`),node('p',d.motivo),node('small',`${d.moderador} · ${new Date(d.creado_en).toLocaleString('es-CL')}`));box.append(card);});}
    }catch(e){if(turn===version)status('moderacion-estado',mensajeError(e));}
  }
  window.PlazaSalas=Object.freeze({abrir,moderar});
})();
