// POST /api/fcm/register — stores or refreshes a device FCM token.
// Body: { device_id, token }
import { saveFcmToken }   from '../../lib/supabase.js';
import { validateApiKey } from '../../lib/validator.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!validateApiKey(req.headers['x-api-key'])) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { device_id, token } = req.body || {};

  if (!device_id || typeof device_id !== 'string' || !device_id.trim()) {
    return res.status(400).json({ error: 'Invalid device_id' });
  }
  if (!token || typeof token !== 'string' || !token.trim()) {
    return res.status(400).json({ error: 'Invalid token' });
  }

  try {
    await saveFcmToken(device_id.trim(), token.trim());
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[fcm/register] ERROR:', err.message);
    return res.status(500).json({ error: 'Server error' });
  }
}
