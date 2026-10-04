'use strict';
const test = require('node:test');
const assert = require('node:assert');
const config = require('../src/pkjs/config');

const memoryStore = () => {
  const data = {};
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v; } };
};

test('defaults when nothing or garbage is stored', () => {
  assert.deepStrictEqual(config.load(memoryStore()), { baseUrl: '', token: '' });
  const store = memoryStore();
  store.setItem('goalgridConfig', '{not json');
  assert.deepStrictEqual(config.load(store), { baseUrl: '', token: '' });
});

test('save and load round-trip; configured means a URL and a token are set', () => {
  const store = memoryStore();
  config.save(store, { baseUrl: 'https://x.example', token: 't' });
  const loaded = config.load(store);
  assert.deepStrictEqual(loaded, { baseUrl: 'https://x.example', token: 't' });
  assert.ok(config.isConfigured(loaded));
  assert.ok(!config.isConfigured({ baseUrl: '', token: 't' }));
  assert.ok(!config.isConfigured({ baseUrl: 'https://x.example', token: '' }));
});

test('settings-page results are validated and normalised', () => {
  const encode = (o) => encodeURIComponent(JSON.stringify(o));
  assert.deepStrictEqual(config.parseResult(encode({ baseUrl: 'https://x.example///', token: 'a' })),
    { baseUrl: 'https://x.example', token: 'a' });
  assert.deepStrictEqual(config.parseResult(encode({ baseUrl: 'http://10.0.0.5:8080' })),
    { baseUrl: 'http://10.0.0.5:8080', token: '' });
  assert.strictEqual(config.parseResult(encode({ baseUrl: 'ftp://x' })), null);
  assert.strictEqual(config.parseResult(encode({ baseUrl: 'javascript:alert(1)' })), null);
  assert.strictEqual(config.parseResult(encode({})), null);
  assert.strictEqual(config.parseResult('%E0%A4%A'), null);
});

test('pageUrl points at the hosted config page, prefilled via the fragment', () => {
  const url = config.pageUrl({ baseUrl: 'https://x.example', token: 'a&b=c' });
  assert.ok(url.startsWith(config.CONFIG_URL));
  assert.ok(url.indexOf('?') === -1, 'prefill must ride in the fragment, not the query');
  const params = new URLSearchParams(url.slice(url.indexOf('#') + 1));
  assert.strictEqual(params.get('baseUrl'), 'https://x.example');
  assert.strictEqual(params.get('token'), 'a&b=c');
});

test('pageUrl prefills the default service URL when none is stored', () => {
  assert.ok(config.pageUrl({ baseUrl: '', token: '' })
    .includes(encodeURIComponent(config.DEFAULT_BASE_URL)));
  // A stored URL still wins over the default.
  assert.ok(config.pageUrl({ baseUrl: 'https://mine.example', token: '' })
    .includes(encodeURIComponent('https://mine.example')));
});
