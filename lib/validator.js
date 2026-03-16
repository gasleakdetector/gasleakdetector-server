export function validateApiKey(key) {
  return key === process.env.VALID_API_KEY;
}

export function determineStatus(ppm) {
  const danger  = parseInt(process.env.DANGER_THRESHOLD);
  const warning = parseInt(process.env.WARNING_THRESHOLD);

  if (ppm >= danger)  return 'danger';
  if (ppm >= warning) return 'warning';
  return 'normal';
}

export function validateLogData(body) {
  const { device_id, ppm } = body;

  if (!device_id || typeof device_id !== 'string') {
    return { valid: false, error: 'Invalid device_id' };
  }

  const ppmNum = parseFloat(ppm);
  if (isNaN(ppmNum) || ppmNum < 0) {
    return { valid: false, error: 'Invalid ppm value' };
  }

  return { valid: true, ppm: ppmNum };
}
