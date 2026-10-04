'use strict';
const test = require('node:test');
const assert = require('node:assert');
const calendar = require('../src/pkjs/calendar');
const { fetchGrid, gridUrl } = require('../src/pkjs/service');

const UTC = calendar.fixedClock(0);
const PACIFIC = calendar.fixedClock(-480);

function fakeRequest(behave) {
  const request = { headers: {}, open(method, url) { this.method = method; this.url = url; },
    setRequestHeader(name, value) { this.headers[name] = value; }, send() { behave(this); } };
  return () => request;
}

function run(config, behave) {
  let request;
  const make = fakeRequest((r) => { request = r; behave(r); });
  return new Promise((resolve) => {
    fetchGrid(config, 20728, UTC, (error, data) => resolve({ error, data, request }), make);
  });
}

test('url asks for the 21 local days ending on the watch\'s today, as a half-open instant window', () => {
  const day = 86400000;
  assert.strictEqual(gridUrl('https://x.example/', 20728, UTC),
    `https://x.example/grid?from=${(20728 - 20) * day}&to=${20729 * day}`);
  // Same local days, expressed in UTC instants: Pacific midnight is 08:00 UTC.
  assert.strictEqual(gridUrl('https://x.example', 20728, PACIFIC),
    `https://x.example/grid?from=${(20728 - 20) * day + 8 * 3600000}&to=${20729 * day + 8 * 3600000}`);
});

test('sends the bearer token and parses a 200 response', async () => {
  const { error, data, request } = await run({ baseUrl: 'https://x.example', token: 'secret' },
    (r) => { r.status = 200; r.responseText = '{"schema":1}'; r.onload(); });
  assert.strictEqual(error, null);
  assert.deepStrictEqual(data, { schema: 1 });
  assert.strictEqual(request.method, 'GET');
  assert.strictEqual(request.headers.Authorization, 'Bearer secret');
  assert.ok(request.timeout > 0);
});

test('omits the Authorization header when no token is configured', async () => {
  const { request } = await run({ baseUrl: 'https://x.example', token: '' },
    (r) => { r.status = 200; r.responseText = '{}'; r.onload(); });
  assert.ok(!('Authorization' in request.headers));
});

test('reports HTTP errors, bad JSON, network errors and timeouts', async () => {
  const config = { baseUrl: 'https://x.example', token: '' };
  const http = await run(config, (r) => { r.status = 401; r.onload(); });
  assert.strictEqual(http.error.message, 'HTTP 401');
  assert.strictEqual(http.error.status, 401);  // 401 is tagged so index.js can clear the grid
  const detailed = await run(config, (r) => { r.status = 400; r.responseText = '{"error":"invalid from: x"}'; r.onload(); });
  assert.strictEqual(detailed.error.message, 'HTTP 400: invalid from: x');
  assert.strictEqual(detailed.error.status, 400);  // every non-200 is tagged, so index.js can match 403 too
  const json = await run(config, (r) => { r.status = 200; r.responseText = '<html>'; r.onload(); });
  assert.match(json.error.message, /invalid JSON/);
  const net = await run(config, (r) => r.onerror());
  assert.match(net.error.message, /network/);
  const slow = await run(config, (r) => r.ontimeout());
  assert.match(slow.error.message, /timed out/);
});

test('calls back only once even if events fire twice', async () => {
  let calls = 0;
  const make = fakeRequest((r) => { r.onerror(); r.ontimeout(); });
  fetchGrid({ baseUrl: 'https://x.example' }, 20728, UTC, () => { calls++; }, make);
  assert.strictEqual(calls, 1);
});
