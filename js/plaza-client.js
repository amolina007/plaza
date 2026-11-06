/* Una sola conexión para el directorio y el panel de cuenta. Misma identidad de Core.
 * En previews Netlify se conserva localmente: las cookies de convergenciaaura.cl
 * no se pueden guardar en netlify.app. No se copian credenciales entre dominios. */
(() => {
  'use strict';
  const host = location.hostname;
  const dev = host !== 'plaza.convergenciaaura.cl';
  window.PlazaConfig = Object.freeze({
    dev,
    core: dev ? 'https://dev--convergencia-aura-core.netlify.app' : 'https://core.convergenciaaura.cl',
  });
  if (!window.supabase) return;
  window.auraClient = window.supabase.createClient(
    'https://utilbunuziotzumuiayu.supabase.co',
    'sb_publishable_yF7fkqR5YlWrwnGfyRP2gA_i2k5YiZh',
    { auth: { storageKey: 'plaza-aura-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
  );
  const secondary = document.createElement('script');
  secondary.src = `${window.PlazaConfig.core}/js/aura-acceso-secundario.js`;
  document.head.append(secondary);
})();
