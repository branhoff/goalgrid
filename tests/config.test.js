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

test('save and load round-trip; configured means a service URL is set', () => {
  const store = memoryStore();
  config.save(store, { baseUrl: 'https://x.example', token: 't' });
  const loaded = config.load(store);
  assert.deepStrictEqual(loaded, { baseUrl: 'https://x.example', token: 't' });
  assert.ok(config.isConfigured(loaded));
  assert.ok(!config.isConfigured({ baseUrl: '', token: 't' }));
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

test('settings page escapes stored values and is a data URL', () => {
  const html = config.pageHtml({ baseUrl: 'https://x"><script>', token: 'a&b' });
  assert.ok(!html.includes('x"><script>'));
  assert.ok(html.includes('x&quot;&gt;&lt;script&gt;'));
  assert.ok(html.includes('a&amp;b'));
  assert.ok(config.pageUrl({ baseUrl: '', token: '' }).startsWith('data:text/html;charset=utf-8,'));
});
