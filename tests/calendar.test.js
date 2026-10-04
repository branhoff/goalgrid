'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const path = require('path');
const calendar = require('../src/pkjs/calendar');

const DAY = calendar.DAY_MS;
const epochDay = (y, m, d) => Date.UTC(y, m - 1, d) / DAY;
const instant = (iso) => Date.parse(iso);

test('a fixed-offset clock puts late-evening UTC instants on the local previous day', () => {
  const pacific = calendar.fixedClock(-480);
  assert.strictEqual(pacific.dayOf(instant('2026-10-03T05:00:00Z')), epochDay(2026, 10, 2));
  assert.strictEqual(pacific.dayOf(instant('2026-10-03T08:00:00Z')), epochDay(2026, 10, 3));
  assert.strictEqual(pacific.dayOf(instant('2026-10-03T07:59:59.999Z')), epochDay(2026, 10, 2));
  const tokyo = calendar.fixedClock(540);
  assert.strictEqual(tokyo.dayOf(instant('2026-10-02T15:00:00Z')), epochDay(2026, 10, 3));
});

test('midnight is the first instant of the local day and inverts dayOf', () => {
  for (const offset of [-480, 0, 330, 540]) {
    const clock = calendar.fixedClock(offset);
    const day = epochDay(2026, 10, 3);
    assert.strictEqual(clock.dayOf(clock.midnight(day)), day);
    assert.strictEqual(clock.dayOf(clock.midnight(day) - 1), day - 1);
  }
});

test('the day window is half-open and covers exactly the requested local days', () => {
  const clock = calendar.fixedClock(-480);
  const today = epochDay(2026, 10, 3);
  const { from, to } = calendar.dayWindow(clock, today, 21);
  assert.strictEqual(clock.dayOf(from), today - 20);
  assert.strictEqual(clock.dayOf(from - 1), today - 21);
  assert.strictEqual(clock.dayOf(to - 1), today);
  assert.strictEqual(clock.dayOf(to), today + 1);
  assert.strictEqual(to - from, 21 * DAY);  // no DST in a fixed offset
});

// The real local clock, under real timezones (spawned so TZ applies from startup).
function inZone(timeZone, script) {
  const code = `const c = require(${JSON.stringify(path.join(__dirname, '../src/pkjs/calendar'))}).localClock();
    const iso = (s) => Date.parse(s); const ed = (y, m, d) => Date.UTC(y, m - 1, d) / 86400000;
    console.log(JSON.stringify((${script})(c, iso, ed)));`;
  return JSON.parse(execFileSync(process.execPath, ['-e', code], { env: { ...process.env, TZ: timeZone } }));
}

test('local clock: Los Angeles buckets evening logs on the local day', () => {
  const [a, b, c] = inZone('America/Los_Angeles', (clock, iso, ed) => [
    clock.dayOf(iso('2026-10-03T05:00:00Z')) - ed(2026, 10, 2),
    clock.dayOf(iso('2026-10-03T08:00:00Z')) - ed(2026, 10, 3),
    clock.midnight(ed(2026, 10, 3)) - iso('2026-10-03T07:00:00Z'),
  ]);
  assert.deepStrictEqual([a, b, c], [0, 0, 0]);
});

test('local clock: days are 23 and 25 hours long across DST changes', () => {
  const [spring, fall] = inZone('America/Los_Angeles', (clock, iso, ed) => [
    (clock.midnight(ed(2026, 3, 9)) - clock.midnight(ed(2026, 3, 8))) / 3600000,
    (clock.midnight(ed(2026, 11, 2)) - clock.midnight(ed(2026, 11, 1))) / 3600000,
  ]);
  assert.strictEqual(spring, 23);
  assert.strictEqual(fall, 25);
});

test('local clock: a window spanning a DST change still ends on today', () => {
  const [spanDays, endsOnToday] = inZone('America/Los_Angeles', (clock, iso, ed) => {
    const today = ed(2026, 3, 9);
    const win = { from: clock.midnight(today - 20), to: clock.midnight(today + 1) };
    return [(win.to - win.from) / 3600000, clock.dayOf(win.to - 1) === today];
  });
  assert.strictEqual(spanDays, 21 * 24 - 1);
  assert.strictEqual(endsOnToday, true);
});

test('local clock: half-hour offsets (Kolkata) and the far east (Auckland)', () => {
  const [beforeMidnight, atMidnight] = inZone('Asia/Kolkata', (clock, iso, ed) => [
    clock.dayOf(iso('2026-10-02T18:29:59Z')) - ed(2026, 10, 2),
    clock.dayOf(iso('2026-10-02T18:30:00Z')) - ed(2026, 10, 3),
  ]);
  assert.deepStrictEqual([beforeMidnight, atMidnight], [0, 0]);
  const auckland = inZone('Pacific/Auckland', (clock, iso, ed) =>
    clock.dayOf(iso('2026-10-02T12:00:00Z')) - ed(2026, 10, 3));
  assert.strictEqual(auckland, 0);
});
