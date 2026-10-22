import { getStore } from '@netlify/blobs';
import { STORE, cleanup } from '../../lib/acquisition.mjs';
// Netlify invokes schedules only on the production deploy; an extra guard isolates previews.
export default async (_request, context) => {
  if (context.deploy?.context !== 'production') return new Response(null, { status: 204 });
  await cleanup(getStore(STORE));
  return new Response(null, { status: 204 });
};
export const config = { schedule: '0 6 * * *' };
