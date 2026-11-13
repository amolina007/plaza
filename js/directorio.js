(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const client = window.auraClient;
  const config = window.PlazaConfig;
  const list = $('lista-directorio');
  const status = $('estado-directorio');
  const stats = $('estadisticas');
  const dialog = $('acceso-dialogo');
  let rows = [], session = null, generation = 0, pendingEmail = '', loaded = false;
  const model = window.PlazaDirectory;
  let category = 'todos';
  const announce = text => { $('accion-directorio').textContent = text; };
  const el = (tag, cls, value) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (value !== undefined) node.textContent = value;
    return node;
  };
  const link = (label, path, cls = '') => {
    const a = el('a', cls, label);
    a.href = `${config.core}/${path}`;
    return a;
  };
  // Dev API must never be silently promoted with the page.
  if (!client || !config?.dev) {
    status.textContent = 'El directorio no está disponible en este entorno. Puedes abrir Messenger desde el menú.';
    list.setAttribute('aria-busy', 'false');
    return;
  }
  const db = client.schema('core');
  document.querySelectorAll('a[href^="https://core.convergenciaaura.cl/"]').forEach((a) => {
    a.href = a.href.replace('https://core.convergenciaaura.cl', config.core);
  });
  function openLogin() {
    if (session) {
      $('filtro').value = 'mios'; render(); $('canales').scrollIntoView();
    } else if (!dialog.open) dialog.showModal();
  }
  window.PlazaLogin = openLogin;
  document.querySelectorAll('[data-login]').forEach((b) => b.addEventListener('click', openLogin));

  document.querySelectorAll('[data-view]').forEach(a => a.addEventListener('click', () => {
    $('filtro').value = a.dataset.view; render();
  }));
  function categoryInfo(key) { return model.categories.find(c => c[0] === key) || model.categories.at(-1); }
  function paintCategories() {
    const box = $('categorias'); box.replaceChildren();
    for (const [key,label] of [['todos','Todos'],...model.categories]) {
      if (key !== 'todos' && !rows.some(r => r.categoria === key)) continue;
      const button = el('button','category-chip',label); button.type = 'button';
      button.setAttribute('aria-pressed',String(category === key));
      button.addEventListener('click', () => { category=key; render();
        [...box.children].find(b => b.textContent===label)?.focus(); });
      box.append(button);
    }
  }
  function paintTopics() {
    const box=$('temas-semana'); box.replaceChildren();
    const topics=rows.filter(r=>r.tema);
    if (!topics.length) box.append(el('p','muted','Los responsables de los canales todavía no han publicado un tema para esta semana.'));
    topics.forEach(r=>{
      const item=el('div','sidebar-topic');
      item.append(el('small','',r.nombre),el('p','',r.tema),link('Conversar →',`messenger.html?sala=${encodeURIComponent(r.slug)}`));box.append(item);
    });
  }
  function favoriteButton(row) {
    const button=el('button','favorite-button',row.favorito?'★':'☆'); button.type='button';
    button.dataset.favorite=row.id;
    button.setAttribute('aria-pressed',String(row.favorito));
    button.setAttribute('aria-label',`${row.favorito?'Quitar de favoritos':'Guardar en favoritos'}: ${row.nombre}`);
    button.title=row.favorito?'Quitar de favoritos':'Guardar canal';
    button.addEventListener('click',async()=>{
      if (!session) { openLogin(); return; }
      const turn=generation, desired=!row.favorito;button.disabled=true;announce('Guardando favorito…');
      try {
        const {data,error}=await db.rpc('plaza_dev_favorito',{p_sala_id:row.id,p_guardar:desired});
        if(error||data!==desired) throw error||new Error('Respuesta inválida');
        if(turn!==generation)return;
        row.favorito=desired;render();announce(desired?'Canal guardado en tus favoritos.':'Canal quitado de tus favoritos.');
        [...list.querySelectorAll('[data-favorite]')].find(b=>b.dataset.favorite===row.id)?.focus();
      } catch(_) { if(turn===generation)announce('No se pudo cambiar el favorito. Vuelve a intentarlo.'); }
      finally { button.disabled=false; }
    });return button;
  }
  function editorialForm(row) {
    const details=el('details','editorial-settings');details.append(el('summary','','Administrar categoría y tema'));
    const form=el('form'),catLabel=el('label','','Categoría del canal'),select=el('select');
    model.categories.forEach(([key,name])=>{const option=el('option','',name);option.value=key;select.append(option);});
    select.value=row.categoria;catLabel.append(select);
    const topicLabel=el('label','','Tema de esta semana'),input=el('textarea');input.rows=3;input.maxLength=280;input.value=row.tema||'';topicLabel.append(input);
    const hint=el('p','muted','Hasta 280 caracteres. Se muestra hasta el domingo, hora de Chile. Déjalo vacío para retirar el tema.');
    const save=el('button','btn btn-primary','Guardar categoría y tema');save.type='submit';
    const feedback=el('p','muted');feedback.setAttribute('role','status');form.append(catLabel,topicLabel,hint,save,feedback);
    form.addEventListener('submit',async event=>{
      event.preventDefault();const turn=generation;save.disabled=true;feedback.textContent='Guardando…';
      try {
        const {error}=await db.rpc('plaza_dev_guardar_editorial',{p_sala_id:row.id,p_categoria:select.value,p_tema:input.value});
        if(error)throw error;if(turn!==generation)return;
        await load();announce('Categoría y tema guardados.');
      }catch(_){if(turn===generation)feedback.textContent='No se pudo guardar. Revisa tu acceso y vuelve a intentar.';}
      finally{save.disabled=false;}
    });details.append(form);return details;
  }
  function card(row) {
    const article = el('article', 'directory-card');
    article.dataset.category=row.categoria;
    const info=categoryInfo(row.categoria);
    const artwork=el('div','channel-art',info[2]);artwork.setAttribute('aria-hidden','true');article.append(artwork);
    const badges = el('div', 'directory-tags');
    badges.append(el('span', '', ({ publica: 'Público', privada: 'Privado · con acceso', restringida: 'Restringido · con acceso' })[row.tipo] || 'Con acceso'));
    badges.append(el('span','category-label',info[1]));
    if (row.soy_miembro) badges.append(el('span', '', 'Ya eres integrante'));
    const destination = `messenger.html?sala=${encodeURIComponent(row.slug)}`;
    const title = el('h4'); title.append(link(row.nombre, destination));
    article.append(badges, title, el('p', 'description', row.descripcion || 'Este canal todavía no tiene descripción.'));
    article.append(el('p', 'members', `${row.integrantes} ${Number(row.integrantes) === 1 ? 'integrante' : 'integrantes'}`));
    const topic=el('div','weekly-topic');
    topic.append(el('small','eyebrow','TEMA DE LA SEMANA'),el('p','',row.tema||'Todavía no hay un tema publicado esta semana.'));
    if(row.tema_hasta)topic.append(el('small','muted',`Hasta el ${row.tema_hasta.split('-').reverse().join('/')} · hora de Chile`));
    article.append(topic);
    const details = el('details');
    details.append(el('summary', '', 'Reglas del canal'));
    const rules = el('p', 'rules', row.reglas || 'Este canal todavía no ha publicado reglas propias.');
    details.append(rules, link('Consultar normas generales de Convergencia', 'normas-chats.html'));
    if (row.puede_editar) {
      const form = el('form');
      const label = el('label', '', 'Editar reglas de este canal');
      const input = el('textarea'); input.rows = 5; input.maxLength = 5000; input.value = row.reglas || '';
      label.append(input);
      const save = el('button', 'btn btn-primary', 'Guardar reglas'); save.type = 'submit';
      const feedback = el('p', 'muted'); feedback.setAttribute('role', 'status');
      form.append(label, save, feedback);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const turn = generation;
        save.disabled = true; feedback.textContent = 'Guardando…';
        try {
          const { error } = await db.rpc('plaza_dev_guardar_reglas', { p_sala_id: row.id, p_reglas: input.value });
          if (error) throw error;
          if (turn !== generation) return;
          row.reglas = input.value.trim();
          rules.textContent = row.reglas || 'Este canal todavía no ha publicado reglas propias.';
          feedback.textContent = 'Reglas guardadas.';
        } catch (_) { if (turn === generation) feedback.textContent = 'No se pudieron guardar. Comprueba tu acceso y vuelve a intentar.'; }
        finally { save.disabled = false; }
      });
      details.append(form);
    }
    article.append(details);
    if(row.puede_editar)article.append(editorialForm(row));
    const actions = el('div', 'card-actions');
    actions.append(link('Abrir chat →', destination, 'btn btn-primary'),favoriteButton(row));
    article.append(actions);
    return article;
  }
  function render() {
    if (!loaded) return;
    const query = $('buscar').value;
    const filter = $('filtro').value;
    const visible=model.filter(rows,{query,view:filter,category,order:$('orden').value});
    paintCategories();paintTopics();
    list.replaceChildren();
    for (const [kind, title] of [['oficial','Chats de Convergencia'],['usuarios','Canales creados por usuarios']]) {
      if (['oficial','usuarios'].includes(filter) && filter !== kind) continue;
      const subset = visible.filter((r) => r.origen === kind);
      const section = el('section', 'directory-group');
      section.append(el('h3', '', `${title} · ${subset.length}`));
      const grid = el('div', 'directory-grid');
      subset.forEach((r) => grid.append(card(r)));
      if (!subset.length) section.append(el('p', 'directory-empty', filter === 'favoritos' ? (session ? 'Todavía no tienes favoritos en esta selección. Usa el marcador para guardar un canal.' : 'Inicia sesión para consultar y guardar tus favoritos.') : query || filter === 'mios' || category !== 'todos'
        ? 'No hay canales que coincidan con esta selección.'
        : kind === 'usuarios' ? 'No hay canales de usuarios visibles para ti. Los privados solo aparecen cuando tienes acceso.' : 'No hay chats oficiales visibles para ti.'));
      else section.append(grid);
      list.append(section);
    }
    status.textContent = `${visible.length} ${visible.length === 1 ? 'canal visible' : 'canales visibles'}. Integrantes inscritos, no personas conectadas ahora.`;
  }
  function clear() { loaded = false; rows = []; list.replaceChildren(); stats.replaceChildren(); $('categorias').replaceChildren(); $('temas-semana').replaceChildren(); announce(''); }
  async function load() {
    const turn = ++generation;
    clear();
    status.textContent = 'Consultando los canales de Core…';
    list.setAttribute('aria-busy','true'); $('actualizar').disabled = true;
    try {
      const { data, error } = await db.rpc('plaza_dev_explorar');
      if (error || !Array.isArray(data)) throw error || new Error('Respuesta inválida');
      if (turn !== generation) return;
      rows = data; loaded = true;
      if(category!=='todos'&&!rows.some(r=>r.categoria===category))category='todos';
      for (const [value,label] of [[rows.filter(r=>r.origen==='oficial').length,'chats de Convergencia visibles'],[rows.filter(r=>r.origen==='usuarios').length,'canales de usuarios visibles'],[rows.filter(r=>r.soy_miembro).length,'canales a los que perteneces']]) {
        if (!session && label.includes('perteneces')) continue;
        const stat = el('div','directory-stat'); stat.append(el('strong','',String(value)),el('span','',label)); stats.append(stat);
      }
      render();
    } catch (_) {
      if (turn !== generation) return;
      clear(); $('temas-semana').textContent='No se pudieron consultar los temas.'; status.textContent = 'No pudimos consultar el directorio. Revisa tu conexión o tu acceso y pulsa Actualizar para volver a intentar.';
    } finally { if(turn === generation) { list.setAttribute('aria-busy','false'); $('actualizar').disabled = false; } }
  }
  ['buscar','filtro','orden'].forEach((id) => $(id).addEventListener(id === 'buscar' ? 'input' : 'change', render));
  $('actualizar').addEventListener('click',load);
  let identity;
  function changed(next) {
    const nextId = next?.user?.id || null;
    if (nextId === identity) return;
    identity = nextId; session = next; category='todos';
    ++generation; clear(); // Clear private data synchronously, before any asynchronous reload.
    $('sesion-directorio').textContent = session ? 'Estás viendo los canales públicos y los canales a los que tu cuenta tiene acceso.' : 'Puedes explorar las salas públicas. Inicia sesión para consultar tus canales privados.';
    document.querySelectorAll('[data-login]').forEach(b => { b.textContent = session ? 'Ver mis canales' : 'Iniciar sesión y ver mis canales'; });
    if (session) dialog.close();
    setTimeout(load,0); // Never await Supabase calls inside its auth callback.
  }
  client.auth.onAuthStateChange((_event,next) => changed(next));
  client.auth.getSession().then(({data,error}) => { if(error) throw error; changed(data.session); }).catch(() => { changed(null); });
  $('acceso-correo').addEventListener('submit', async (event) => {
    event.preventDefault(); const button=event.currentTarget.querySelector('button'); button.disabled=true;
    pendingEmail=$('correo').value.trim(); $('acceso-estado').textContent='Solicitando código…';
    try {
      const { error }=await client.auth.signInWithOtp({email:pendingEmail,options:{shouldCreateUser:false,emailRedirectTo:location.origin+'/'}});
      if(error) throw error;
      $('acceso-codigo').hidden=false; $('codigo').focus();
      $('acceso-estado').textContent='Revisa el código enviado a tu correo. Usa una cuenta existente de Convergencia.';
    } catch (_) { $('acceso-estado').textContent='No se pudo solicitar el código. Comprueba el correo de tu cuenta o espera antes de reintentar.'; }
    finally { button.disabled=false; }
  });
  $('acceso-codigo').addEventListener('submit', async (event) => {
    event.preventDefault(); const button=event.currentTarget.querySelector('button'); button.disabled=true;
    $('acceso-estado').textContent='Verificando…';
    try {
      const { error }=await client.auth.verifyOtp({email:pendingEmail,token:$('codigo').value.trim(),type:'email'});
      if(error) throw error;
      $('codigo').value=''; $('acceso-estado').textContent=''; dialog.close();
    } catch (_) { $('acceso-estado').textContent='El código no es válido o venció. Revisa el correo o solicita uno nuevo.'; }
    finally { button.disabled=false; }
  });
})();
