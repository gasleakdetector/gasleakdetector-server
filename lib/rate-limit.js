import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(60, '1 m')
});

export async function checkIngestRateLimit(deviceId) {
  return ratelimit.limit(deviceId);
}
