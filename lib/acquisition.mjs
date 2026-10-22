export const STORE = 'plaza-acquisition-v1';
export async function cleanup(store, now = Date.now()) {
  const cutoff = new Date(now - 30 * 86400000).toISOString().slice(0, 10);
  for await (const page of store.list({ paginate: true })) {
    for (const blob of page.blobs) {
      if (/^\d{4}-\d{2}-\d{2}\//.test(blob.key) && blob.key.slice(0, 10) < cutoff) await store.delete(blob.key);
    }
  }
}
const PLAZA = 'https://plaza.convergenciaaura.cl';
const CORE = 'https://core.convergenciaaura.cl';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const events = ['plaza_view', 'plaza_chat_click', 'core_arrival', 'core_authenticated_view'];
const sources = ['google_organic', 'paid', 'direct', 'other'];
const placements = ['nav', 'hero', 'plazaaura', 'chile', 'ritmos', 'ladra', 'create'];
export function validate(body, origin, now = Date.now()) {
  if (!body || Array.isArray(body) || Object.keys(body).sort().join(',') !== 'day,event,id,placement,source,v') return null;
  const { v, id, day, event, source, placement } = body;
  if (v !== 1 || typeof id !== 'string' || typeof day !== 'string' || !uuid.test(id) || !events.includes(event) || !sources.includes(source) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const time = Date.parse(day + 'T00:00:00Z');
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== day || now - time < 0 || now - time >= 172800000) return null;
  if (event.startsWith('plaza_') ? origin !== PLAZA : origin !== CORE) return null;
  if (event === 'plaza_view' ? placement !== 'none' : !placements.includes(placement)) return null;
  return { v, id, day, event, source, placement };
}
export function createHandler(getStore, now = () => Date.now()) {
  return async (request, context) => {
    const response = status => new Response(null, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    if (request.method !== 'POST') return response(405);
    if (context.deploy?.context !== 'production') return response(204);
    if (request.headers.get('Sec-GPC') === '1' || request.headers.get('DNT') === '1') return response(204);
    if (!request.headers.get('content-type')?.startsWith('application/json')) return response(415);
    // Bound the stream, including chunked requests without Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return response(400);
    let text = '', size = 0;
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 512) { await reader.cancel(); return response(413); }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
      let parsed;
      try { parsed = JSON.parse(text); } catch (_) { return response(400); }
      const body = validate(parsed, request.headers.get('origin'), now());
      if (!body) return response(400);
      // Immutable object per event: no read-modify-write counter, no lost increments.
      const key = `${body.day}/${body.id}/${body.event}`;
      await getStore(STORE).setJSON(key, body, { onlyIfNew: true });
      return response(204);
    } catch (_) {
      // Do not log the request body, headers or credentials.
      return response(503);
    }
  };
}
export function summarize(rows) {
  const visits = new Map();
  for (const row of rows) {
    const valid = validate(row, row?.event?.startsWith('plaza_') ? PLAZA : CORE, Date.parse(row?.day + 'T12:00:00Z'));
    if (!valid) continue;
    const key = `${row.day}/${row.id}`;
    const visit = visits.get(key) || { day: row.day, source: null, events: new Map() };
    visit.events.set(row.event, row);
    if (row.event === 'plaza_view') visit.source = row.source;
    visits.set(key, visit);
  }
  const groups = new Map();
  for (const visit of visits.values()) {
    const source = visit.source || 'unmatched';
    const key = `${visit.day}/${source}`;
    const group = groups.get(key) || { day: visit.day, source, plaza_view: 0, plaza_chat_click: 0, core_arrival: 0, core_authenticated_view: 0, matched_arrivals: 0, matched_authenticated_views: 0 };
    for (const event of events) if (visit.events.has(event)) group[event]++;
    const click = visit.events.get('plaza_chat_click');
    const arrival = visit.events.get('core_arrival');
    const auth = visit.events.get('core_authenticated_view');
    if (visit.source && click && arrival && [click, arrival].every(r => r.source === source) && click.placement === arrival.placement) {
      group.matched_arrivals++;
      if (auth && auth.source === source && auth.placement === click.placement) group.matched_authenticated_views++;
    }
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => `${a.day}/${a.source}`.localeCompare(`${b.day}/${b.source}`));
}
