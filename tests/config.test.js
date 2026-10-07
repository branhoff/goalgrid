'use strict';
const test = require('node:test');
const assert = require('node:assert');
const config = require('../src/pkjs/config');

const memoryStore = () => {
  const data = {};
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v; } };
};

test('defaults to the app URL, an empty token, and the dark theme when nothing or garbage is stored', () => {
  assert.deepStrictEqual(config.load(memoryStore()),
    { baseUrl: config.DEFAULT_BASE_URL, token: '', theme: 0 });
  const store = memoryStore();
  store.setItem('goalgridConfig', '{not json');
  assert.deepStrictEqual(config.load(store),
    { baseUrl: config.DEFAULT_BASE_URL, token: '', theme: 0 });
});

test('load honours a dev baseUrlOverride but ignores a stale legacy baseUrl', () => {
  const dev = memoryStore();
  dev.setItem('goalgridConfig', JSON.stringify({ baseUrlOverride: 'http://localhost:8787', token: 't' }));
  assert.deepStrictEqual(config.load(dev),
    { baseUrl: 'http://localhost:8787', token: 't', theme: 0 });
  // An old build persisted the URL under `baseUrl`; that key is ignored so the install re-points.
  const legacy = memoryStore();
  legacy.setItem('goalgridConfig', JSON.stringify({ baseUrl: 'https://old.example', token: 't' }));
  assert.deepStrictEqual(config.load(legacy),
    { baseUrl: config.DEFAULT_BASE_URL, token: 't', theme: 0 });
});

test('load round-trips the saved theme and clamps an unknown value to dark', () => {
  const light = memoryStore();
  config.save(light, { token: 't', theme: 1 });
  assert.strictEqual(config.load(light).theme, 1);
  const bad = memoryStore();
  bad.setItem('goalgridConfig', JSON.stringify({ token: 't', theme: 9 }));
  assert.strictEqual(config.load(bad).theme, 0);
});

test('save persists the token and theme; load pairs them with the app URL; configured needs a token', () => {
  const store = memoryStore();
  config.save(store, { baseUrl: 'https://ignored.example', token: 't', theme: 1 });
  // The stored baseUrl is never trusted: storage holds only the token and theme.
  assert.strictEqual(JSON.parse(store.getItem('goalgridConfig')).baseUrl, undefined);
  const loaded = config.load(store);
  assert.deepStrictEqual(loaded, { baseUrl: config.DEFAULT_BASE_URL, token: 't', theme: 1 });
  assert.ok(config.isConfigured(loaded));
  assert.ok(!config.isConfigured({ baseUrl: config.DEFAULT_BASE_URL, token: '' }));
  // Saving an empty token clears it; a token-less record loads as an empty token on the dark theme.
  config.save(store, { token: '' });
  assert.strictEqual(store.getItem('goalgridConfig'), '{"token":"","theme":0}');
  assert.deepStrictEqual(config.load(store),
    { baseUrl: config.DEFAULT_BASE_URL, token: '', theme: 0 });
});

test('settings-page results keep the app URL and take the token and theme', () => {
  const encode = (o) => encodeURIComponent(JSON.stringify(o));
  assert.deepStrictEqual(config.parseResult(encode({ token: 'a' })),
    { baseUrl: config.DEFAULT_BASE_URL, token: 'a', theme: 0 });
  assert.deepStrictEqual(config.parseResult(encode({ token: 'a', theme: 1 })),
    { baseUrl: config.DEFAULT_BASE_URL, token: 'a', theme: 1 });
  // Clearing the token is a legitimate result (empty string is still a string).
  assert.deepStrictEqual(config.parseResult(encode({ token: '' })),
    { baseUrl: config.DEFAULT_BASE_URL, token: '', theme: 0 });
  // A legacy payload that still carries a baseUrl is ignored in favour of the app URL.
  assert.deepStrictEqual(config.parseResult(encode({ baseUrl: 'https://old.example', token: 'b' })),
    { baseUrl: config.DEFAULT_BASE_URL, token: 'b', theme: 0 });
  // A payload with no string token is rejected rather than silently wiping the saved token.
  assert.strictEqual(config.parseResult(encode({})), null);
  assert.strictEqual(config.parseResult(encode({ token: 5 })), null);
  assert.strictEqual(config.parseResult(encode(0)), null);
  assert.strictEqual(config.parseResult(encode([])), null);
  assert.strictEqual(config.parseResult('%E0%A4%A'), null);
  assert.strictEqual(config.parseResult('not%20json'), null);
});

test('pageUrl points at the hosted page, carrying the token and theme in the fragment', () => {
  const url = config.pageUrl({ baseUrl: 'https://ignored.example', token: 'a&b=c', theme: 1 });
  assert.ok(url.startsWith(config.CONFIG_URL));
  assert.ok(url.indexOf('?') === -1, 'prefill must ride in the fragment, not the query');
  const params = new URLSearchParams(url.slice(url.indexOf('#') + 1));
  assert.strictEqual(params.get('token'), 'a&b=c');
  assert.strictEqual(params.get('theme'), '1');
  // The app URL is not sent: the page pins its own copy, so the fragment can't inject one.
  assert.strictEqual(params.get('baseUrl'), null);
  assert.ok(!url.includes(encodeURIComponent(config.DEFAULT_BASE_URL)));
  // A missing theme defaults to dark (0) in the fragment.
  assert.ok(config.pageUrl({ token: 't' }).indexOf('theme=0') !== -1);
});
