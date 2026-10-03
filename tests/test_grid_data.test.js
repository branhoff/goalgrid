'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { toWireFormat, CAPACITY } = require('../src/pkjs/grid_data');

const TODAY = 20728;
const FIXTURES = path.join(__dirname, '../src/pkjs/fixtures');

test('every shipped fixture converts to a full, consistent payload', () => {
  for (const file of fs.readdirSync(FIXTURES)) {
    const wire = toWireFormat(JSON.parse(fs.readFileSync(path.join(FIXTURES, file))), TODAY);
    assert.strictEqual(wire.bytes.length, CAPACITY * 2, file);
    assert.strictEqual(wire.epochDay, TODAY, file);
    for (let i = 0; i < wire.bytes.length; i += 2) {
      assert(wire.bytes[i] <= wire.bytes[i + 1], `${file}: completed > total at day ${i / 2}`);
    }
  }
});

test('newest day is today; gaps are empty; unknown and duplicate ids are ignored', () => {
  const data = {
    version: 1,
    goals: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    days: [
      { date: '2026-10-02', completed: ['a', 'b'] },
      { date: '2026-10-01', completed: ['a', 'a', 'zzz'] },
      { date: '2026-09-29', completed: ['a', 'b', 'c'] },
      { date: '2020-01-01', completed: ['a'] },
    ],
  };
  const { bytes } = toWireFormat(data, TODAY);
  assert.deepStrictEqual(bytes.slice(0, 2), [2, 3]);
  assert.deepStrictEqual(bytes.slice(2, 4), [1, 3]);
  assert.deepStrictEqual(bytes.slice(4, 6), [0, 3]);
  assert.deepStrictEqual(bytes.slice(6, 8), [3, 3]);
});

test('unsupported schema versions are rejected', () => {
  assert.throws(() => toWireFormat({ version: 2, goals: [], days: [] }, TODAY), /unsupported/);
  assert.throws(() => toWireFormat(null, TODAY), /unsupported/);
});

test('pkjs sources use ES5 only (PebbleKit JS cannot run modern syntax)', () => {
  const forbidden = /=>|\b(const|let|class|async|await)\b|`|\.\.\./;
  for (const file of fs.readdirSync(path.join(__dirname, '../src/pkjs'))) {
    if (!file.endsWith('.js')) continue;
    const source = fs.readFileSync(path.join(__dirname, '../src/pkjs', file), 'utf8');
    const code = source.replace(/\/\/.*$/gm, '').replace(/'(\\.|[^'\\])*'/g, "''");
    assert.doesNotMatch(code, forbidden, `${file} uses non-ES5 syntax`);
  }
});
