/* Plaza funciona como vistas independientes; la navegación nunca recorre una página larga. */
(() => {
  'use strict';
  const paneles = [...document.querySelectorAll('[data-vista-panel]')];
  const enlaces = [...document.querySelectorAll('[data-seccion]')];
  if (!paneles.length) return;

  const porHash = { '#inicio': 'inicio', '#canales': 'explorar', '#feed': 'feed', '#mi-perfil': 'mi-perfil' };
  function mostrar(vista, { actualizarHash = false } = {}) {
    const elegida = vista === 'mis-canales' ? vista : (paneles.some((p) => p.dataset.vistaPanel === vista) ? vista : 'inicio');
    const panelElegido = elegida === 'mis-canales' ? 'explorar' : elegida;
    paneles.forEach((panel) => { panel.hidden = panel.dataset.vistaPanel !== panelElegido; });
    enlaces.forEach((enlace) => {
      const activo = enlace.dataset.seccion === elegida;
      if (activo) enlace.setAttribute('aria-current', 'page');
      else enlace.removeAttribute('aria-current');
    });
    if (actualizarHash && location.hash !== `#${elegida === 'mi-perfil' ? 'mi-perfil' : elegida}`) {
      history.replaceState(null, '', `#${elegida === 'mis-canales' ? 'canales' : elegida}`);
    }
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'instant' });
  }

  enlaces.forEach((enlace) => enlace.addEventListener('click', (event) => {
    event.preventDefault();
    mostrar(enlace.dataset.seccion, { actualizarHash: true });
  }));
  document.querySelectorAll('a[href="#canales"]:not([data-seccion])').forEach((enlace) => {
    enlace.addEventListener('click', (event) => { event.preventDefault(); mostrar('explorar', { actualizarHash: true }); });
  });
  window.addEventListener('hashchange', () => mostrar(porHash[location.hash] || 'inicio'));
  const inicial = porHash[location.hash] || 'inicio';
  mostrar(inicial);
  window.PlazaVistas = Object.freeze({ mostrar });
})();
