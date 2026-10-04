'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const calendar = require('../src/pkjs/calendar');
const wire = require('../src/pkjs/wire');

const read = (...parts) => JSON.parse(fs.readFileSync(path.join(__dirname, ...parts)));
const golden = read('contract', 'grid-response.json');
const FIXTURES = path.join(__dirname, '../src/pkjs/fixtures');
const UTC = calendar.fixedClock(0);
const PACIFIC = calendar.fixedClock(-480);
const epochDay = (y, m, d) => Date.UTC(y, m - 1, d) / calendar.DAY_MS;
const at = (iso) => Date.parse(iso);

const goal = (id, type, extra) => Object.assign({ id, number: id, name: `g${id}`, type }, extra);
const response = (goals, series) => ({ schema: 2, from: 0, to: 1, goals, series });
const goalValues = (out, index) => out.values.slice(index * wire.CAPACITY, (index + 1) * wire.CAPACITY);

test('golden service response (schema 2) maps onto the wire format', () => {
  const out = wire.toWire(golden, 0, UTC);  // the golden events are all on 1970-01-01
  assert.strictEqual(out.epochDay, 0);
  assert.deepStrictEqual(out.types, [0, 1, 0]);
  assert.strictEqual(out.names, 'running\npushups\nreading');
  assert.strictEqual(out.values.length, 3 * wire.CAPACITY);
  assert.strictEqual(goalValues(out, 0)[0], 1);   // binary: three events, done once
  assert.strictEqual(goalValues(out, 1)[0], 25);  // count: same-instant events both counted (20 + 5)
  assert.ok(goalValues(out, 2).every((v) => v === 0));
});

test('binary goals are done if any event lands in the day, whatever its value', () => {
  const series = { 1: [{ at: at('2026-10-03T10:00:00Z'), value: 0 }, { at: at('2026-10-03T11:00:00Z'), value: 1 }] };
  const out = wire.toWire(response([goal(1, 'binary')], series), epochDay(2026, 10, 3), UTC);
  assert.strictEqual(goalValues(out, 0)[0], 1);
});

test('count goals sum within a local day and split across days by timezone', () => {
  const series = { 1: [{ at: at('2026-10-03T05:00:00Z'), value: 10 }, { at: at('2026-10-03T20:00:00Z'), value: 5 }] };
  const today = epochDay(2026, 10, 3);
  const inUtc = goalValues(wire.toWire(response([goal(1, 'count')], series), today, UTC), 0);
  assert.strictEqual(inUtc[0], 15);  // one UTC day
  const inPacific = goalValues(wire.toWire(response([goal(1, 'count')], series), today, PACIFIC), 0);
  assert.strictEqual(inPacific[0], 5);   // 13:00 local on the 3rd
  assert.strictEqual(inPacific[1], 10);  // 21:00 local on the 2nd: a late-evening log stays on its day
});

test('local-midnight boundaries: the last millisecond belongs to the earlier day', () => {
  const midnight = at('2026-10-03T08:00:00Z');  // 00:00 Pacific
  const series = { 1: [{ at: midnight - 1, value: 1 }, { at: midnight, value: 1 }] };
  const out = goalValues(wire.toWire(response([goal(1, 'binary')], series), epochDay(2026, 10, 3), PACIFIC), 0);
  assert.strictEqual(out[0], 1);
  assert.strictEqual(out[1], 1);
});

test('events after today or before the window are ignored', () => {
  const today = epochDay(2026, 10, 3);
  const series = { 1: [
    { at: at('2026-10-04T00:00:00Z'), value: 7 },                 // tomorrow
    { at: at('2026-09-12T23:59:59Z'), value: 7 },                 // 21 days back: outside the window
    { at: at('2026-09-13T00:00:00Z'), value: 3 },                 // oldest day inside it
  ] };
  const out = goalValues(wire.toWire(response([goal(1, 'count')], series), today, UTC), 0);
  assert.strictEqual(out.reduce((a, b) => a + b, 0), 3);
  assert.strictEqual(out[wire.CAPACITY - 1], 3);
});

test('count values are clamped to a byte; negative and non-numeric values are ignored', () => {
  const day = at('2026-10-03T12:00:00Z');
  const series = { 1: [{ at: day, value: 300 }], 2: [{ at: day, value: -5 }, { at: day, value: 'x' }] };
  const out = wire.toWire(response([goal(1, 'count'), goal(2, 'count')], series), epochDay(2026, 10, 3), UTC);
  assert.strictEqual(goalValues(out, 0)[0], 255);
  assert.strictEqual(goalValues(out, 1)[0], 0);
});

test('goals are ordered by number, capped at five, names trimmed; missing series read as empty', () => {
  const goals = [];
  for (let n = 7; n >= 1; n--) {
    goals.push({ id: 100 + n, number: n, name: `goal ${n} is quite long indeed\nx`, type: 'count' });
  }
  const out = wire.toWire(response(goals, {}), 1, UTC);
  assert.strictEqual(out.types.length, wire.MAX_GOALS);
  const names = out.names.split('\n');
  assert.strictEqual(names.length, wire.MAX_GOALS);
  assert.ok(names[0].startsWith('goal 1') && names.every((n) => n.length <= 15));
  assert.ok(out.values.every((v) => v === 0));
});

test('unsupported responses and goal types are rejected', () => {
  assert.throws(() => wire.toWire(null, 1, UTC), /unsupported/);
  assert.throws(() => wire.toWire({ schema: 1, goals: [], series: {} }, 1, UTC), /unsupported/);  // old shape
  assert.throws(() => wire.toWire({ schema: 2, goals: [], series: null }, 1, UTC), /unsupported/);
  assert.throws(() => wire.toWire(response([goal(1, 'constructor')], {}), 1, UTC), /goal type/);
});

test('rebase shifts instants by whole days so the last day lands on today', () => {
  const to = Date.UTC(2026, 9, 3);  // exclusive end: the fixture's last day is Oct 2
  const fixture = { schema: 2, from: to - 3 * calendar.DAY_MS, to, goals: [goal(1, 'binary')],
                    series: { 1: [{ at: to - 12 * 3600000, value: 1 }] } };
  const today = epochDay(2030, 1, 15);
  const moved = wire.rebaseToToday(fixture, today);
  assert.strictEqual(Math.floor((moved.to - 1) / calendar.DAY_MS), today);
  assert.strictEqual(moved.series['1'][0].at - fixture.series['1'][0].at, (today - epochDay(2026, 10, 2)) * calendar.DAY_MS);
  assert.throws(() => wire.rebaseToToday({}, today), /unsupported/);
});

test('every fixture is complete and buckets the same in every timezone', () => {
  for (const file of fs.readdirSync(FIXTURES)) {
    const fixture = read('..', 'src', 'pkjs', 'fixtures', file);
    const today = epochDay(2026, 10, 3);
    const rebased = wire.rebaseToToday(fixture, today);
    const reference = wire.toWire(rebased, today, UTC);
    assert.strictEqual(reference.values.length, fixture.goals.length * wire.CAPACITY, file);
    for (let offset = -720; offset <= 660; offset += 30) {  // UTC-12 .. UTC+11
      const out = wire.toWire(rebased, today, calendar.fixedClock(offset));
      assert.deepStrictEqual(out.values, reference.values, `${file} at UTC${offset / 60}`);
    }
  }
});
