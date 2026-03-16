// GET /api/status?device_id=xxx — latest reading for a device.
import { getLatestStatus } from '../lib/supabase.js';
import { validateApiKey } from '../lib/validator.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!validateApiKey(req.headers['x-api-key'])) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { device_id } = req.query;
  if (!device_id) return res.status(400).json({ error: 'device_id required' });

  try {
    const status = await getLatestStatus(device_id);
    return res.status(200).json(status);
  } catch (err) {
    console.error('[status] ERROR:', err.message);
    return res.status(404).json({ error: 'No data found' });
  }
}
