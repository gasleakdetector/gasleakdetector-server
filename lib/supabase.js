import { createClient } from '@supabase/supabase-js';

export const supabaseClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { realtime: { params: { eventsPerSecond: 10 } } }
);

const supabaseService = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const EMAIL_COOLDOWN_MS = parseInt(process.env.EMAIL_COOLDOWN_MINUTES || '2') * 60 * 1000;

export async function saveLog({ deviceId, ppm, status, ip, name, lat, lng }) {
  const { data, error } = await supabaseService
    .from('gas_logs_raw')
    .insert({ device_id: deviceId, gas_ppm: ppm, status, ip_address: ip })
    .select()
    .single();

  if (error) throw error;

  const devicePayload = { id: deviceId };
  if (name && typeof name === 'string' && name.trim())
    devicePayload.name = name.trim();
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  if (!isNaN(latNum) && latNum !== 0 && !isNaN(lngNum) && lngNum !== 0) {
    devicePayload.lat = latNum;
    devicePayload.lng = lngNum;
  }

  await supabaseService
    .from('devices')
    .upsert(devicePayload, { onConflict: 'id', ignoreDuplicates: false });

  return data;
}

export async function getLatestStatus(deviceId) {
  const { data, error } = await supabaseService
    .from('gas_logs_raw')
    .select('*')
    .eq('device_id', deviceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) throw error;
  return data;
}

export async function getLogs(deviceId, limit = 100, cursor = null) {
  let query = supabaseService
    .from('gas_logs_raw')
    .select('id, device_id, gas_ppm, status, created_at');

  if (deviceId) query = query.eq('device_id', deviceId);
  if (cursor)   query = query.lt('id', cursor);

  const { data, error } = await query
    .order('id', { ascending: false })
    .limit(limit);

  if (error) throw error;

  const nextCursor = data.length === limit ? data[data.length - 1].id : null;
  return { logs: data, nextCursor };
}

export async function getRawHistorical(deviceId, range = '1d', cursor = null, pageSize = 1000) {
  const rangeMs = {
    '1h':  3600000,
    '6h':  21600000,
    '1d':  86400000,
    '7d':  604800000,
    '30d': 2592000000,
  };

  const startTime = new Date(Date.now() - (rangeMs[range] || rangeMs['1d'])).toISOString();

  let query = supabaseService
    .from('gas_logs_raw')
    .select('id, gas_ppm, status, created_at')
    .gte('created_at', startTime)
    .order('id', { ascending: true })
    .limit(pageSize);

  if (deviceId) query = query.eq('device_id', deviceId);
  if (cursor)   query = query.gt('id', cursor);

  const { data, error } = await query;
  if (error) throw error;

  const nextCursor = data.length === pageSize ? data[data.length - 1].id : null;
  return { data, nextCursor };
}

export async function shouldSendAlert(deviceId, status) {
  if (status !== 'danger') return false;

  const cooldownTime = new Date(Date.now() - EMAIL_COOLDOWN_MS).toISOString();

  const { data } = await supabaseService
    .from('gas_logs_raw')
    .select('created_at')
    .eq('device_id', deviceId)
    .eq('status', 'danger')
    .gte('created_at', cooldownTime)
    .order('created_at', { ascending: false })
    .limit(2);

  if (!data || data.length === 0) return true;
  if (data.length === 1)          return true;

  return (new Date(data[0].created_at) - new Date(data[1].created_at)) >= EMAIL_COOLDOWN_MS;
}

export function getRealtimeConfig() {
  return { url: process.env.SUPABASE_URL, anonKey: process.env.SUPABASE_ANON_KEY };
}

export function subscribeToDevice(deviceId, callbacks) {
  return supabaseClient
    .channel(`gas_logs_raw:device_id=eq.${deviceId}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'gas_logs_raw',
      filter: `device_id=eq.${deviceId}`
    }, (payload) => callbacks.onInsert?.(payload.new))
    .subscribe((s) => callbacks.onStatus?.(s));
}

export function unsubscribeFromDevice(channel) {
  if (channel) supabaseClient.removeChannel(channel);
}
