import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

test('minute aggregation keeps a ten-minute recovery window', () => {
  assert.match(
    schema,
    /from public\.gas_logs_raw\s+where created_at >= now\(\) - interval '10 minutes'/
  );
});

test('hour aggregation keeps a four-hour recovery window', () => {
  assert.match(
    schema,
    /from public\.gas_logs_minute\s+where bucket >= now\(\) - interval '4 hours'/
  );
});
