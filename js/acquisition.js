/* Medición propia: eventos por visita, nunca identidades de personas. */
(() => {
  'use strict';
  if (window.__auraAcquisition) return;
  window.__auraAcquisition = true;
  const PLAZA = 'https://plaza.convergenciaaura.cl';
  const CORE = 'https://core.convergenciaaura.cl';
  const sources = ['google_organic', 'paid', 'direct', 'other'];
  const placements = ['nav', 'hero', 'plazaaura', 'chile', 'ritmos', 'ladra', 'create'];
  const url = new URL(location.href);
  const plaza = url.origin === PLAZA && ['/', '/index.html'].includes(url.pathname);
  const core = url.origin === CORE && url.pathname === '/messenger.html';
  if (!plaza && !core) return;
  const privacySignal = () => navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1';
  const preference = 'aura-acquisition-disabled';
  let optedOut = false;
  try { optedOut = localStorage.getItem(preference) === '1'; } catch (_) { /* no storage required */ }
  const enabled = () => !optedOut && !privacySignal();
  const sent = new Set();
  let referrer = '';
  try { referrer = new URL(document.referrer).hostname; } catch (_) { /* direct/unknown */ }
  const day = new Date().toISOString().slice(0, 10);
  const source = (() => {
    if (['gclid', 'gbraid', 'wbraid'].some(k => url.searchParams.has(k)) || /^(cpc|ppc|paid|paid_search)$/i.test(url.searchParams.get('utm_medium') || '')) return 'paid';
    // A Google referrer is only a proxy for organic search; no query is read.
    if (/^(www\.)?google\.(com|cl|es|com\.ar|com\.mx)$/.test(referrer)) return 'google_organic';
    return referrer ? 'other' : 'direct';
  })();
  let journey = null;
  if (plaza && enabled() && window.crypto?.randomUUID) {
    journey = { id: crypto.randomUUID(), day, source, placement: 'none' };
  }
  if (core) {
    const id = url.searchParams.get('pa_id');
    const fromDay = url.searchParams.get('pa_day');
    const fromSource = url.searchParams.get('pa_source');
    const placement = url.searchParams.get('pa_cta');
    const age = Date.now() - Date.parse(fromDay + 'T00:00:00Z');
    if (enabled() && referrer === new URL(PLAZA).hostname && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id || '') && /^\d{4}-\d{2}-\d{2}$/.test(fromDay || '') && age >= 0 && age < 172800000 && sources.includes(fromSource) && placements.includes(placement)) {
      journey = { id, day: fromDay, source: fromSource, placement };
    }
    // Remove only our parameters. OAuth/magic-link query, hash and history.state survive.
    ['pa_id', 'pa_day', 'pa_source', 'pa_cta'].forEach(k => url.searchParams.delete(k));
    if (url.href !== location.href) {
      try { history.replaceState(history.state, '', url.href); } catch (_) { /* auth never depends on this */ }
    }
  }
  const links = plaza ? [...document.querySelectorAll('a[data-acquisition-cta]')] : [];
  function updateLinks() {
    links.forEach(link => {
      const target = new URL(link.href);
      if (target.origin !== CORE || target.pathname !== '/messenger.html') return;
      ['pa_id', 'pa_day', 'pa_source', 'pa_cta'].forEach(k => target.searchParams.delete(k));
      if (enabled() && journey && placements.includes(link.dataset.acquisitionCta)) {
        target.searchParams.set('pa_id', journey.id);
        target.searchParams.set('pa_day', journey.day);
        target.searchParams.set('pa_source', journey.source);
        target.searchParams.set('pa_cta', link.dataset.acquisitionCta);
      }
      link.href = target.href;
    });
  }
  function send(event, placement = journey?.placement) {
    if (!enabled() || !journey || sent.has(event)) return;
    sent.add(event);
    // Body has only allowlisted labels and a random, single-visit ID. No URL/referrer/token.
    const body = JSON.stringify({ v: 1, event, ...journey, placement });
    const endpoint = '/api/acquisition';
    try {
      // Omit credentials explicitly; use keepalive without blocking navigation.
      const attempt = () => fetch(endpoint, { method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
      attempt().then(response => {
        if (response.status >= 500 && enabled()) return attempt();
      }).catch(() => { /* transport failure must never affect chat/login */ });
    } catch (_) { /* optional measurement */ }
  }
  document.querySelectorAll('[data-acquisition-optout]').forEach(control => {
    control.checked = !enabled();
    control.disabled = privacySignal();
    control.addEventListener('change', () => {
      optedOut = control.checked;
      try { localStorage.setItem(preference, optedOut ? '1' : '0'); } catch (_) { /* preference is optional */ }
      if (plaza && enabled() && !journey && window.crypto?.randomUUID) {
        journey = { id: crypto.randomUUID(), day, source, placement: 'none' };
        send('plaza_view', 'none');
      }
      // Disabling takes effect immediately, including on already decorated links.
      updateLinks();
    });
  });
  if (plaza) {
    updateLinks();
    send('plaza_view', 'none');
    const click = event => {
      if (!event.isTrusted || event.defaultPrevented || (event.type === 'auxclick' && event.button !== 1)) return;
      const link = event.target.closest?.('a[data-acquisition-cta]');
      if (link && links.includes(link)) send('plaza_chat_click', link.dataset.acquisitionCta);
    };
    document.addEventListener('click', click);
    document.addEventListener('auxclick', click);
  } else if (journey) {
    const navigation = performance.getEntriesByType('navigation')[0];
    if (navigation && navigation.type !== 'navigate') return; // no conversions on reload/back
    send('core_arrival');
    const signedIn = document.querySelector('[data-signed-in]');
    if (!signedIn) return;
    const observe = () => {
      if (!signedIn.hidden) {
        send('core_authenticated_view');
        observer.disconnect();
      }
    };
    const observer = new MutationObserver(observe);
    observer.observe(signedIn, { attributes: true, attributeFilter: ['hidden'] });
    observe();
  }
})();
