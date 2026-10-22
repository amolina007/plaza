import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, validate, summarize, cleanup } from '../lib/acquisition.mjs';
const now = Date.parse('2026-10-22T20:00:00Z');
const plaza = 'https://plaza.convergenciaaura.cl';
const core = 'https://core.convergenciaaura.cl';
const base = { v: 1, id: 'a5c1a91d-9058-44cb-88eb-ab432c608f93', day: '2026-10-22', event: 'plaza_view', source: 'google_organic', placement: 'none' };
const context = { deploy: { context: 'production' } };
const request = (body = base, origin = plaza, headers = {}) => new Request(plaza + '/api/acquisition', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
test('accepts only the schema and origin/event pair; rejects arbitrary personal fields', () => {
  assert.deepEqual(validate(base, plaza, now), base);
  for (const body of [{ ...base, email: 'private@example.invalid' }, { ...base, source: 'someone@example.invalid' }, { ...base, event: 'login' }, { ...base, id: '../key' }, { ...base, day: '2026-02-31' }, { ...base, day: '2026-10-19' }, { ...base, day: '2026-10-23' }]) assert.equal(validate(body, plaza, now), null);
  assert.equal(validate(base, core, now), null);
  assert.equal(validate(base, 'https://dev.plaza.convergenciaaura.cl', now), null);
});
test('retry and simultaneous writes store one immutable event, never a shared counter', async () => {
  const objects = new Map();
  const handler = createHandler(() => ({ setJSON: async (key, value, options) => {
    assert.equal(options.onlyIfNew, true);
    if (!objects.has(key)) objects.set(key, value);
  } }), () => now);
  const responses = await Promise.all([handler(request(), context), handler(request(), context)]);
  assert.ok(responses.every(r => r.status === 204));
  assert.equal(objects.size, 1);
  assert.deepEqual([...objects.values()][0], base);
});
test('preview and privacy signals never open the production store', async () => {
  const handler = createHandler(() => { throw Error('must not open'); }, () => now);
  assert.equal((await handler(request(), { deploy: { context: 'deploy-preview' } })).status, 204);
  for (const header of ['DNT', 'Sec-GPC']) assert.equal((await handler(request(base, plaza, { [header]: '1' }), context)).status, 204);
});
test('rejects malformed, oversized, wrong-method and wrong-origin requests', async () => {
  const handler = createHandler(() => { throw Error('must not open'); }, () => now);
  assert.equal((await handler(request('{'), context)).status, 400);
  assert.equal((await handler(request('x'.repeat(513)), context)).status, 413);
  assert.equal((await handler(request(base, 'https://evil.invalid'), context)).status, 400);
  assert.equal((await handler(new Request(plaza + '/api/acquisition'), context)).status, 405);
  assert.equal((await handler(request(base, plaza, { 'Content-Type': 'text/plain' }), context)).status, 415);
});
test('storage failure is visible as 503 without leaking data', async () => {
  const handler = createHandler(() => ({ setJSON: async () => { throw Error('secret error'); } }), () => now);
  const response = await handler(request(), context);
  assert.equal(response.status, 503);
  assert.equal(await response.text(), '');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});
test('retention removes only old event keys and follows every listing page', async () => {
  const removed = [];
  const store = {
    async *list(options) {
      assert.equal(options.paginate, true);
      yield { blobs: [{ key: '2026-09-21/id/plaza_view' }, { key: '2026-09-22/id/core_arrival' }] };
      yield { blobs: [{ key: '2026-10-22/id/plaza_view' }, { key: 'unrelated' }] };
    },
    async delete(key) { removed.push(key); }
  };
  await cleanup(store, now);
  assert.deepEqual(removed, ['2026-09-21/id/plaza_view']);
});
test('reports matched arrivals only with view, click, matching source and placement', () => {
  const click = { ...base, event: 'plaza_chat_click', placement: 'hero' };
  const arrival = { ...click, event: 'core_arrival' };
  const auth = { ...click, event: 'core_authenticated_view' };
  const [row] = summarize([base, click, click, arrival, auth]);
  assert.equal(row.plaza_view, 1);
  assert.equal(row.plaza_chat_click, 1);
  assert.equal(row.matched_arrivals, 1);
  assert.equal(row.matched_authenticated_views, 1);
  assert.equal(summarize([base, arrival])[0].matched_arrivals, 0);
  assert.equal(summarize([base, click, { ...arrival, source: 'paid' }])[0].matched_arrivals, 0);
  assert.equal(summarize([base, click, { ...arrival, placement: 'nav' }])[0].matched_arrivals, 0);
  assert.equal(summarize([arrival])[0].source, 'unmatched');
});
