(() => {
  'use strict';
  const button = document.getElementById('inicio-sesion');
  if (!button) return;
  const login = () => {
    if (window.PlazaLogin) window.PlazaLogin();
    else location.assign(`${window.PlazaConfig?.core || 'https://core.convergenciaaura.cl'}/messenger.html`);
  };
  button.addEventListener('aura-hub:login', login);
  button.addEventListener('click', () => { if (!window.AuraHub) login(); });
})();
