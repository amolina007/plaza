/* Cinco destinos principales y pantallas de detalle independientes. */
(() => {
  'use strict';
  const paneles=[...document.querySelectorAll('[data-vista-panel]')];
  const enlaces=[...document.querySelectorAll('[data-seccion]')];
  const rutas={'#inicio':'inicio','#canales':'explorar','#explorar':'explorar','#mis-canales':'mis-canales','#feed':'feed','#mi-perfil':'mi-perfil','#crear-sala':'crear-sala'};
  function mostrar(vista,{actualizarHash=false}={}) {
    const elegida=vista==='mis-canales'?vista:paneles.some(p=>p.dataset.vistaPanel===vista)?vista:'inicio';
    paneles.forEach(p=>{p.hidden=p.dataset.vistaPanel!==(elegida==='mis-canales'?'explorar':elegida);});
    const raiz=['crear-sala','sala'].includes(elegida)?'explorar':elegida==='moderacion'?'mis-canales':elegida;
    enlaces.forEach(a=>{if(a.dataset.seccion===raiz)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    if(actualizarHash)history.pushState(null,'',`#${elegida==='explorar'?'canales':elegida}`);
    if(elegida==='mis-canales'){document.getElementById('filtro').value='mios';window.dispatchEvent(new Event('plaza:mis-salas'));}
    document.getElementById('t-directorio').textContent=elegida==='mis-canales'?'Mis salas':'Explorar salas';
    document.querySelector('main')?.scrollTo({top:0,behavior:'instant'});
  }
  enlaces.forEach(a=>a.addEventListener('click',e=>{e.preventDefault();mostrar(a.dataset.seccion,{actualizarHash:true});if(a.dataset.seccion==='explorar')window.dispatchEvent(new Event('plaza:explorar'));}));
  document.querySelectorAll('a[href="#canales"]:not([data-seccion])').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();mostrar('explorar',{actualizarHash:true});}));
  window.addEventListener('popstate',()=>mostrar(rutas[location.hash]||'explorar'));
  window.addEventListener('hashchange',()=>mostrar(rutas[location.hash]||'explorar'));
  mostrar(rutas[location.hash]||'inicio');
  window.PlazaVistas=Object.freeze({mostrar});
})();
