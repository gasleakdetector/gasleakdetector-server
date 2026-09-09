import test from 'node:test';
import assert from 'node:assert/strict';
import {
  determineStatus,
  validateApiKey,
  validateLogData
} from '../lib/validator.js';

test('validateApiKey accepts only the configured key', () => {
  process.env.VALID_API_KEY = 'test-key';

  assert.equal(validateApiKey('test-key'), true);
  assert.equal(validateApiKey('wrong-key'), false);
  assert.equal(validateApiKey(undefined), false);
});

test('determineStatus applies configured thresholds', () => {
  process.env.DANGER_THRESHOLD = '800';
  process.env.WARNING_THRESHOLD = '300';

  assert.equal(determineStatus(299), 'normal');
  assert.equal(determineStatus(300), 'warning');
  assert.equal(determineStatus(799), 'warning');
  assert.equal(determineStatus(800), 'danger');
});

test('validateLogData normalizes numeric ppm values', () => {
  assert.deepEqual(validateLogData({ device_id: 'ESP_01', ppm: '245.5' }), {
    valid: true,
    ppm: 245.5
  });
});

test('validateLogData rejects missing devices and invalid ppm values', () => {
  assert.equal(validateLogData({ ppm: 10 }).valid, false);
  assert.equal(validateLogData({ device_id: 'ESP_01', ppm: -1 }).valid, false);
  assert.equal(validateLogData({ device_id: 'ESP_01', ppm: 'not-a-number' }).valid, false);
});
