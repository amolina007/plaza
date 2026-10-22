import { getStore } from '@netlify/blobs';
import { createHandler } from '../../lib/acquisition.mjs';
export default createHandler(getStore);
export const config = {
  path: '/api/acquisition',
  rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowSize: 60, windowLimit: 30 }
};
