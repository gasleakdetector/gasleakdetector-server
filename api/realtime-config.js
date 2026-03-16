// GET /api/realtime-config — returns Supabase URL + anon key for Android WebSocket.
import { validateApiKey } from '../lib/validator.js';
import { getRealtimeConfig } from '../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!validateApiKey(req.headers['x-api-key'])) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    return res.status(200).json(getRealtimeConfig());
  } catch (error) {
    console.error('[realtime-config] ERROR:', error.message);
    return res.status(500).json({ error: 'Server error' });
  }
}
