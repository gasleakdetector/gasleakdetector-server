// GET /api/historical — cursor-based pagination over gas_logs_raw.
// Query: device_id, range (1h|6h|1d|7d|30d), cursor (last seen id).
// Returns 1000 rows per page; keep calling until nextCursor is null.
import { getRawHistorical } from '../lib/supabase.js';
import { validateApiKey } from '../lib/validator.js';
import zlib from 'zlib';

const VALID_RANGES = ['1h', '6h', '1d', '7d', '30d'];
const PAGE_SIZE = 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!validateApiKey(req.headers['x-api-key'])) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { device_id, range = '1d', cursor } = req.query;

  if (!VALID_RANGES.includes(range)) {
    return res.status(400).json({ error: `Invalid range. Use: ${VALID_RANGES.join(', ')}` });
  }

  try {
    const { data, nextCursor } = await getRawHistorical(
      device_id || null,
      range,
      cursor ? parseInt(cursor) : null,
      PAGE_SIZE
    );

    const payload = JSON.stringify({
      data,
      total:     data.length,
      nextCursor,
      range,
      device_id: device_id || null,
    });

    const acceptEncoding = req.headers['accept-encoding'] || '';
    if (acceptEncoding.includes('gzip')) {
      zlib.gzip(Buffer.from(payload, 'utf8'), (err, compressed) => {
        if (err) {
          res.setHeader('Content-Type', 'application/json');
          return res.status(200).send(payload);
        }
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Vary', 'Accept-Encoding');
        res.status(200).send(compressed);
      });
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.status(200).send(payload);
    }

  } catch (err) {
    console.error('[historical] ERROR:', err.message);
    return res.status(500).json({ error: 'Server error' });
  }
}
