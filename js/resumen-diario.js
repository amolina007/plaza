(() => {
  'use strict';
  const cliente = window.auraClient;
  const lista = document.getElementById('resumenes-diarios');
  const estado = document.getElementById('resumen-estado');
  if (!cliente || !lista || !estado || !window.PlazaConfig?.dev) return;
  let version = 0;
  const nodo = (tag, texto) => { const n=document.createElement(tag); n.textContent=texto; return n; };
  async function cargar() {
    const actual=++version;
    lista.replaceChildren(); estado.textContent='Cargando resúmenes diarios…';
    try {
      const {data,error}=await cliente.schema('core').rpc('plaza_dev_feed',{p_limite:14});
      if (actual!==version) return;
      if (error || !Array.isArray(data)) throw Error();
      data.forEach(post => {
        const tarjeta=nodo('article',''); tarjeta.className='panel daily-post';
        tarjeta.append(nodo('h3',post.titulo));
        const fecha=nodo('time',new Date(post.fecha).toLocaleString('es-CL',{timeZone:'America/Santiago'}));
        fecha.dateTime=post.fecha; tarjeta.append(fecha,nodo('p',post.texto));
        (Array.isArray(post.canales)?post.canales:[]).forEach(canal=>{
          if (!/^[a-z0-9_-]+$/i.test(canal.slug || '')) return;
          const enlace=nodo('a',`Abrir ${canal.nombre} →`);
          enlace.href=`${window.PlazaConfig.core}/messenger.html?sala=${encodeURIComponent(canal.slug)}`;
          tarjeta.append(enlace);
        });
        lista.append(tarjeta);
      });
      estado.textContent=data.length ? 'Una publicación por día cerrado · horario de Chile.' : 'El primer resumen aparecerá al cerrar el día.';
    } catch { if(actual===version) estado.textContent='No se pudieron cargar los resúmenes. Vuelve a abrir Feed para reintentar.'; }
  }
  document.querySelectorAll('[data-seccion="feed"]').forEach(b=>b.addEventListener('click',cargar));
  cliente.auth.onAuthStateChange(()=> { ++version; lista.replaceChildren(); setTimeout(cargar,0); });
  cargar();
})();
