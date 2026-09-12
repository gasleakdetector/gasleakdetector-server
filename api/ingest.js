// POST /api/ingest — ESP8266 sensor data ingestion.
// Accepts single: { device_id, ppm } or batch: { batch: [{device_id, ppm}, ...] }
import { saveLog, shouldSendAlert } from '../lib/supabase.js';
import { sendAlert } from '../lib/email.js';
import { checkIngestRateLimit } from '../lib/rate-limit.js';
import { validateApiKey, determineStatus, validateLogData } from '../lib/validator.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = req.headers['x-api-key'];
  if (!validateApiKey(apiKey)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim()
          || req.socket?.remoteAddress;

  try {
    if (Array.isArray(req.body?.batch)) {
      const items = [];
      for (const item of req.body.batch.slice(0, 20)) {
        const v = validateLogData(item);
        if (v.valid) items.push({ item, v });
      }

      for (const deviceId of new Set(items.map(({ item }) => item.device_id))) {
        const { success } = await checkIngestRateLimit(deviceId);
        if (!success) return res.status(429).json({ error: 'Rate limit exceeded' });
      }

      const results = [];
      for (const { item, v } of items) {
        const status = determineStatus(v.ppm);
        const log = await saveLog({ deviceId: item.device_id, ppm: v.ppm, status, ip,
          name: item.name, lat: item.lat, lng: item.lng });
        results.push({ id: log.id, status });

        if (await shouldSendAlert(item.device_id, status)) {
          await sendAlert({ deviceId: item.device_id, ppm: v.ppm, timestamp: log.created_at });
        }
      }
      return res.status(200).json({ success: true, count: results.length, results });
    }

    const v = validateLogData(req.body);
    if (!v.valid) return res.status(400).json({ error: v.error });

    const { device_id, name, lat, lng } = req.body;
    const { success } = await checkIngestRateLimit(device_id);
    if (!success) return res.status(429).json({ error: 'Rate limit exceeded' });

    const status = determineStatus(v.ppm);
    const log = await saveLog({ deviceId: device_id, ppm: v.ppm, status, ip, name, lat, lng });

    if (await shouldSendAlert(device_id, status)) {
      await sendAlert({ deviceId: device_id, ppm: v.ppm, timestamp: log.created_at }).catch(() => {});
    }

    return res.status(200).json({ success: true, log_id: log.id, status });

  } catch (error) {
    console.error('[ingest] ERROR:', error.message);
    return res.status(500).json({ error: 'Server error' });
  }
}