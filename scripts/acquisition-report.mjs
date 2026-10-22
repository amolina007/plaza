import { getStore } from '@netlify/blobs';
import { STORE, summarize } from '../lib/acquisition.mjs';
const token = process.env.NETLIFY_AUTH_TOKEN;
if (!token) throw new Error('Falta NETLIFY_AUTH_TOKEN. Usa una credencial privada, nunca la incluyas en la web.');
const store = getStore({ name: STORE, siteID: 'ef85d458-4dfe-4306-9a28-6275abc69a6c', token, consistency: 'strong' });
const rows = [];
for await (const page of store.list({ paginate: true })) {
  for (const blob of page.blobs) {
    const row = await store.get(blob.key, { type: 'json' });
    if (row) rows.push(row);
  }
}
// Only aggregates leave this process, never single-visit IDs.
console.log(JSON.stringify({ timezone: 'UTC', unit: 'visits_not_people', rows: summarize(rows) }, null, 2));
