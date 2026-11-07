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
  const normalize = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
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

  function card(row) {
    const article = el('article', 'directory-card');
    const badges = el('div', 'directory-tags');
    badges.append(el('span', '', ({ publica: 'Público', privada: 'Privado · con acceso', restringida: 'Restringido · con acceso' })[row.tipo] || 'Con acceso'));
    if (row.soy_miembro) badges.append(el('span', '', 'Ya eres integrante'));
    const destination = `messenger.html?sala=${encodeURIComponent(row.slug)}`;
    const title = el('h4'); title.append(link(row.nombre, destination));
    article.append(badges, title, el('p', 'description', row.descripcion || 'Este canal todavía no tiene descripción.'));
    article.append(el('p', 'members', `${row.integrantes} ${Number(row.integrantes) === 1 ? 'integrante' : 'integrantes'}`));
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
    const actions = el('div', 'card-actions');
    actions.append(link('Abrir chat', destination, 'btn btn-primary'));
    article.append(actions);
    return article;
  }
  function render() {
    if (!loaded) return;
    const query = normalize($('buscar').value);
    const filter = $('filtro').value;
    const visible = rows.filter((r) => (filter === 'todos' || r.origen === filter || filter === 'mios' && r.soy_miembro)
      && normalize(`${r.nombre} ${r.descripcion || ''}`).includes(query));
    visible.sort((a,b) => ($('orden').value === 'integrantes' ? Number(b.integrantes) - Number(a.integrantes) : 0)
      || a.nombre.localeCompare(b.nombre, 'es'));
    list.replaceChildren();
    for (const [kind, title] of [['oficial','Chats de Convergencia'],['usuarios','Canales creados por usuarios']]) {
      if (['oficial','usuarios'].includes(filter) && filter !== kind) continue;
      const subset = visible.filter((r) => r.origen === kind);
      const section = el('section', 'directory-group');
      section.append(el('h3', '', `${title} · ${subset.length}`));
      const grid = el('div', 'directory-grid');
      subset.forEach((r) => grid.append(card(r)));
      if (!subset.length) section.append(el('p', 'directory-empty', query || filter === 'mios'
        ? 'No hay canales que coincidan con esta selección.'
        : kind === 'usuarios' ? 'No hay canales de usuarios visibles para ti. Los privados solo aparecen cuando tienes acceso.' : 'No hay chats oficiales visibles para ti.'));
      else section.append(grid);
      list.append(section);
    }
    status.textContent = `${visible.length} ${visible.length === 1 ? 'canal visible' : 'canales visibles'}. Integrantes inscritos, no personas conectadas ahora.`;
  }
  function clear() { loaded = false; rows = []; list.replaceChildren(); stats.replaceChildren(); }
  async function load() {
    const turn = ++generation;
    clear();
    status.textContent = 'Consultando los canales de Core…';
    list.setAttribute('aria-busy','true'); $('actualizar').disabled = true;
    try {
      const { data, error } = await db.rpc('plaza_dev_directorio');
      if (error || !Array.isArray(data)) throw error || new Error('Respuesta inválida');
      if (turn !== generation) return;
      rows = data; loaded = true;
      for (const [value,label] of [[rows.filter(r=>r.origen==='oficial').length,'chats de Convergencia visibles'],[rows.filter(r=>r.origen==='usuarios').length,'canales de usuarios visibles'],[rows.filter(r=>r.soy_miembro).length,'canales a los que perteneces']]) {
        if (!session && label.includes('perteneces')) continue;
        const stat = el('div','directory-stat'); stat.append(el('strong','',String(value)),el('span','',label)); stats.append(stat);
      }
      render();
    } catch (_) {
      if (turn !== generation) return;
      clear(); status.textContent = 'No pudimos consultar el directorio. Revisa tu conexión o tu acceso y pulsa Actualizar para volver a intentar.';
    } finally { if(turn === generation) { list.setAttribute('aria-busy','false'); $('actualizar').disabled = false; } }
  }
  ['buscar','filtro','orden'].forEach((id) => $(id).addEventListener(id === 'buscar' ? 'input' : 'change', render));
  $('actualizar').addEventListener('click',load);
  let identity;
  function changed(next) {
    const nextId = next?.user?.id || null;
    if (nextId === identity) return;
    identity = nextId; session = next;
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
