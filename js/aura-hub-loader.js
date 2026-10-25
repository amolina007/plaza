/* Panel único de AuraCore: dev usa Core dev; producción conserva Core publicado.
 * Reutiliza la sesión del sitio. No copia saldos, EXP ni catálogos.
 */
(() => {
  'use strict';
  if (window.AuraHub || document.querySelector('script[data-aura-hub-core]')) return;
  const host = window.location.hostname;
  const dev = /^dev--[a-z0-9-]+\.netlify\.app$/.test(host)
    || ['dev.convergenciaaura.cl', 'localhost', '127.0.0.1'].includes(host);
  const script = document.createElement('script');
  script.src = dev
    ? 'https://dev--convergencia-aura-core.netlify.app/js/aura-hub.js'
    : 'https://core.convergenciaaura.cl/js/aura-hub.js';
  script.defer = true;
  script.setAttribute('data-aura-hub-core', '');
  document.head.append(script);
})();
