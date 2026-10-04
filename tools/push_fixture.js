#!/usr/bin/env node
'use strict';
// Push a fixture straight into a running emulator's watch inbox, bypassing the phone-side
// JS: the same AppMessage the phone would send, so the real inbox handler runs.
//   node tools/push_fixture.js <fixture-name> [--emulator emery]
//   node tools/push_fixture.js --file response.json [--emulator emery]   (a saved /grid response,
//   used as-is: no rebasing, so it shows the data exactly as the phone would send it)
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const calendar = require('../src/pkjs/calendar');
const wire = require('../src/pkjs/wire');

const FIXTURES = path.join(__dirname, '../src/pkjs/fixtures');
const KEYS_FILE = path.join(__dirname, '../build/js/message_keys.json');

function hostEpochDay(now) {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000;
}

function hex(bytes) {
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// `pebble send-app-message` wants the numeric key ids the SDK assigned at build time.
function loadKeys(file) {
  if (!fs.existsSync(file)) {
    throw new Error('message keys not found: run `pebble build` first');
  }
  return JSON.parse(fs.readFileSync(file));
}

function buildArgs(fixture, epochDay, emulator, keys, clock, rebase = true) {
  const response = rebase ? wire.rebaseToToday(fixture, epochDay) : fixture;
  const data = wire.toWire(response, epochDay, clock);
  const args = ['send-app-message', '--emulator', emulator, '--uint', `${keys.GRID_EPOCH_DAY}=${epochDay}`];
  if (data.types.length > 0) {
    // One --bytes only: repeating the flag keeps just the last occurrence.
    args.push('--bytes', `${keys.GRID_TYPES}=${hex(data.types)}`, `${keys.GRID_VALUES}=${hex(data.values)}`);
  }
  args.push('--string', `${keys.GRID_NAMES}=${data.names}`);
  return args;
}

function optionValue(argv, flag) {
  return argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined;
}

function main(argv) {
  const emulator = optionValue(argv, '--emulator') || 'emery';
  const saved = optionValue(argv, '--file');
  const name = saved ? null : argv[0];
  const file = saved || path.join(FIXTURES, `${name}.json`);
  if (!fs.existsSync(file)) {
    const known = fs.readdirSync(FIXTURES).map((f) => path.basename(f, '.json')).join(', ');
    console.error(`usage: push_fixture.js <${known}> | --file response.json  [--emulator emery]`);
    return 2;
  }
  const args = buildArgs(JSON.parse(fs.readFileSync(file)), hostEpochDay(new Date()), emulator,
    loadKeys(KEYS_FILE), calendar.localClock(), !saved);
  return spawnSync('pebble', args, { stdio: 'inherit' }).status;
}

module.exports = { buildArgs, hex, hostEpochDay, loadKeys };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
