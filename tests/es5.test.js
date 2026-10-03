'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// PebbleKit JS runs ES5 only; modern syntax would break on the phone.
test('pkjs sources use ES5 only', () => {
  const dir = path.join(__dirname, '../src/pkjs');
  const forbidden = /=>|\b(const|let|class|async|await)\b|`|\.\.\./;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const code = fs.readFileSync(path.join(dir, file), 'utf8')
      .replace(/\/\/.*$/gm, '').replace(/'(\\.|[^'\\])*'/g, "''");
    assert.doesNotMatch(code, forbidden, `${file} uses non-ES5 syntax`);
  }
});
