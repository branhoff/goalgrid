'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { buildArgs, hex, hostEpochDay, loadKeys } = require('../tools/push_fixture');
const calendar = require('../src/pkjs/calendar');
const wire = require('../src/pkjs/wire');

const KEYS = { GRID_EPOCH_DAY: 10002, GRID_TYPES: 10003, GRID_NAMES: 10004, GRID_VALUES: 10005 };
const golden = JSON.parse(fs.readFileSync(path.join(__dirname, 'contract', 'grid-response.json')));

test('hex encodes bytes with zero padding', () => {
  assert.strictEqual(hex([0, 10, 255]), '000aff');
  assert.strictEqual(hex([]), '');
});

test('host epoch day uses the local calendar date', () => {
  assert.strictEqual(hostEpochDay(new Date(2026, 9, 2, 23, 59)), 20728);
  assert.strictEqual(hostEpochDay(new Date(2026, 9, 3, 0, 1)), 20729);
});

test('builds the same AppMessage the phone would send', () => {
  const args = buildArgs(golden, 20728, 'chalk', KEYS, calendar.fixedClock(0));
  assert.deepStrictEqual(args.slice(0, 4), ['send-app-message', '--emulator', 'chalk', '--uint']);
  assert.ok(args.includes('10002=20728'));
  assert.ok(args.includes('10003=000100'));
  assert.ok(args.includes('10004=running\npushups\nreading'));
  assert.strictEqual(args.filter((a) => a === '--bytes').length, 1);  // repeats would drop keys
  const values = args.find((a) => a.startsWith('10005=')).slice('10005='.length);
  assert.strictEqual(values.length, 2 * 3 * wire.CAPACITY);
});

test('a fixture with no goals sends only the day and an empty name list', () => {
  const empty = { schema: 2, from: 0, to: 1, goals: [], series: {} };
  const args = buildArgs(empty, 20728, 'emery', KEYS, calendar.fixedClock(0));
  assert.ok(!args.some((a) => a.startsWith('10003=')));
  assert.ok(args.includes('10004='));
});

test('a saved response is used as-is, without rebasing its dates', () => {
  const keys = KEYS;
  const clock = calendar.fixedClock(0);
  const rebased = buildArgs(golden, 20728, 'emery', keys, clock);        // fixture mode
  const asIs = buildArgs(golden, 0, 'emery', keys, clock, false);        // live mode: golden events are on day 0
  const valuesOf = (args) => args.find((a) => a.startsWith('10005=')).slice('10005='.length);
  assert.strictEqual(valuesOf(rebased), valuesOf(asIs));                 // rebasing to 20728 moves them onto "today"
  const notToday = buildArgs(golden, 20728, 'emery', keys, clock, false);
  assert.notStrictEqual(valuesOf(notToday), valuesOf(asIs));             // as-is at another today: events fall outside
});

test('missing build output gives an actionable error', () => {
  assert.throws(() => loadKeys('/nonexistent/message_keys.json'), /pebble build/);
});

test('reads the SDK-assigned key ids', () => {
  const file = path.join(require('os').tmpdir(), `keys-${process.pid}.json`);
  fs.writeFileSync(file, JSON.stringify(KEYS));
  assert.deepStrictEqual(loadKeys(file), KEYS);
  fs.unlinkSync(file);
});
