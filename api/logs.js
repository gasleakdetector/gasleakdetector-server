// GET /api/logs — recent sensor logs with cursor pagination.
// Query: device_id, limit (default 100, max 500), cursor (id)
import { getLogs } from '../lib/supabase.js';
import { validateApiKey } from '../lib/validator.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!validateApiKey(req.headers['x-api-key'])) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { device_id, limit, cursor } = req.query;
  const safeLimit = Math.min(parseInt(limit) || 100, 500);

  try {
    const { logs, nextCursor } = await getLogs(
      device_id || null,
      safeLimit,
      cursor ? parseInt(cursor) : null
    );

    return res.status(200).json({ logs, total: logs.length, nextCursor });
  } catch (err) {
    console.error('[logs] ERROR:', err.message);
    return res.status(500).json({ error: 'Server error' });
  }
}
