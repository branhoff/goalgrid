#!/usr/bin/env node
'use strict';
// Live end-to-end check against a running ring-capture service: build the same /grid URL
// the phone would (service.gridUrl), fetch it with the configured bearer token, validate
// the schema-2 response, and (optionally) push it to a running emulator through the real
// wire pipeline -- exactly the AppMessage the phone would send (push_fixture --file).
//
//   AUTH_TOKEN=... node tools/live_grid.js <baseUrl> [--push] [--emulator emery] [--out f.json]
//
// Fetch uses node's https directly (no XMLHttpRequest in node); everything after the fetch
// is the same code the phone runs.
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { spawnSync } = require('child_process');
const calendar = require('../src/pkjs/calendar');
const wire = require('../src/pkjs/wire');
const service = require('../src/pkjs/service');
const { buildArgs, hostEpochDay, loadKeys } = require('./push_fixture');

const KEYS_FILE = path.join(__dirname, '../build/js/message_keys.json');

function optionValue(argv, flag) {
  var i = argv.indexOf(flag);
  if (i === -1 || i + 1 >= argv.length) {
    return undefined;
  }
  var value = argv[i + 1];
  return value.indexOf('--') === 0 ? undefined : value;  // a trailing flag is not a value
}

function get(url, token) {
  return new Promise(function (resolve, reject) {
    var lib = url.indexOf('https:') === 0 ? https : http;
    var headers = { 'Accept-Encoding': 'identity' };  // node https won't auto-decompress gzip
    if (token) {
      headers.Authorization = 'Bearer ' + token;
    }
    var req = lib.get(url, { headers: headers, timeout: 15000 }, function (res) {
      var body = '';
      res.on('data', function (chunk) { body += chunk; });
      res.on('end', function () { resolve({ status: res.statusCode, body: body }); });
    });
    req.on('error', reject);
    req.on('timeout', function () { req.destroy(new Error('timed out')); });
  });
}

function summarize(response) {
  var totalEvents = Object.keys(response.series || {}).reduce(function (n, id) {
    return n + response.series[id].length;
  }, 0);
  console.log('  schema ' + response.schema + ', window [' + response.from + ', ' + response.to + ')');
  console.log('  goals: ' + response.goals.map(function (g) {
    return '#' + g.number + ' ' + g.name + ' (' + g.type + ')';
  }).join(', '));
  console.log('  events: ' + totalEvents + ' across ' + response.goals.length + ' goals');
}

// Fetch /grid and return the parsed response, or null (after logging) on any failure.
async function retrieve(url, token) {
  console.log('GET ' + url);
  console.log('  Authorization: ' + (token ? 'Bearer ' + token.slice(0, 3) + '...' : '(none)'));
  var res = await get(url, token);
  console.log('HTTP ' + res.status);
  if (res.status !== 200) {
    console.error('non-200 body: ' + res.body.slice(0, 500));
    return null;
  }
  try {
    return JSON.parse(res.body);
  } catch (e) {
    console.error('invalid JSON from service: ' + res.body.slice(0, 200));
    return null;
  }
}

// Push the live response to the emulator exactly as the phone would (rebase=false).
function pushToWatch(response, epochDay, clock, emulator) {
  var args = buildArgs(response, epochDay, emulator, loadKeys(KEYS_FILE), clock, false);
  console.log('Pushing to emulator "' + emulator + '" ...');
  var result = spawnSync('pebble', args, { stdio: 'inherit' });
  if (result.error) {
    console.error('could not run pebble: ' + result.error.message);
    return 1;
  }
  if (result.status === 0) {
    console.log('Pushed. Take a screenshot to verify the watchface updated.');
    return 0;
  }
  return result.status || 1;  // null status (killed by signal) still counts as failure
}

async function main(argv) {
  var baseUrl = argv.find(function (a) { return a.indexOf('http') === 0; });
  var token = process.env.AUTH_TOKEN || optionValue(argv, '--token');
  if (!baseUrl) {
    console.error('usage: AUTH_TOKEN=... node tools/live_grid.js <baseUrl> [--push] [--emulator emery] [--out f.json]');
    return 2;
  }
  var epochDay = hostEpochDay(new Date());
  var clock = calendar.localClock();
  var response = await retrieve(service.gridUrl(baseUrl, epochDay, clock), token);
  if (!response) {
    return 1;
  }
  try {
    wire.toWire(response, epochDay, clock);  // schema-2 validation, same as the phone runs
  } catch (e) {
    console.error('unsupported grid response: ' + e.message);
    return 1;
  }
  console.log('Retrieved response:');
  summarize(response);

  var out = optionValue(argv, '--out');
  if (out) {
    fs.writeFileSync(out, JSON.stringify(response, null, 2));
    console.log('Saved to ' + out);
  }
  if (argv.includes('--push')) {
    return pushToWatch(response, epochDay, clock, optionValue(argv, '--emulator') || 'emery');
  }
  return 0;
}

module.exports = { get: get, summarize: summarize };

if (require.main === module) {
  main(process.argv.slice(2)).then(function (code) { process.exit(code); }, function (err) {
    console.error('request failed: ' + err.message);
    process.exit(1);
  });
}
