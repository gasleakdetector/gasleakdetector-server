import { getHourlyStats } from '../lib/supabase.js';
import { validateApiKey } from '../lib/validator.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!validateApiKey(req.headers['x-api-key'])) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { device_id, limit = '10' } = req.query;
  const pageSize = Math.min(parseInt(limit) || 10, 50);

  try {
    const data = await getHourlyStats(device_id || null, pageSize);
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({ data });
  } catch (err) {
    console.error('[stats] ERROR:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}
