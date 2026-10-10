/*
 * Botón-logo de Plaza Aura.
 *
 * El menú común (sesión, Aura Coin, clasificación y sitios) lo abre aura-hub.js, que conecta solo
 * el botón marcado con data-aura-hub y le escribe data-estado = on | off | cargando.
 * Plaza no tiene formulario de ingreso propio: quien no tiene sesión entra por Aura Messenger.
 */
(() => {
  'use strict';

  const MESSENGER = 'https://core.convergenciaaura.cl/messenger.html';
  const boton = document.getElementById('inicio-sesion');
  if (!boton) return;

  // Sin sesión, el hub avisa con este evento cuando la persona pide iniciar sesión.
  boton.addEventListener('aura-hub:login', () => {
    window.location.assign(MESSENGER);
  });

  // Si el hub no cargó (sin red o aún no publicado), el botón sigue siendo útil.
  boton.addEventListener('click', () => {
    if (!window.AuraHub) window.location.assign(MESSENGER);
  });
})();
