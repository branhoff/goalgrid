'use strict';
const test = require('node:test');
const assert = require('node:assert');
const onboard = require('../web/onboard');
const config = require('../src/pkjs/config');

const noHeader = () => null;

test('parseParams reads the token and theme from the fragment and return_to from the query', () => {
  const params = onboard.parseParams(
    '?return_to=' + encodeURIComponent('pebblejs://close#'),
    '#baseUrl=' + encodeURIComponent('https://x.example') + '&token=abc&theme=1'
  );
  // The fragment's baseUrl is deliberately ignored (app-owned URL); token and theme are read.
  assert.deepStrictEqual(params, { token: 'abc', theme: 1, returnTo: 'pebblejs://close#' });
});

test('parseParams defaults return_to and the dark theme, and tolerates empty input', () => {
  assert.deepStrictEqual(onboard.parseParams('', ''),
    { token: '', theme: 0, returnTo: 'pebblejs://close#' });
  // An unknown theme in the fragment clamps to dark.
  assert.strictEqual(onboard.parseParams('', '#theme=7').theme, 0);
});

test('parseParams handles a key with no value and malformed encoding', () => {
  assert.strictEqual(onboard.parseParams('', '#token').token, '');
  assert.strictEqual(onboard.parseParams('', '#token=%E0%A4%A').token, '%E0%A4%A');
});

test('signupRequest targets /signup and normalises the base URL', () => {
  const req = onboard.signupRequest('https://x.example///');
  assert.strictEqual(req.url, 'https://x.example/signup');
  assert.strictEqual(req.method, 'POST');
  assert.strictEqual(req.headers['Content-Type'], 'application/json');
  assert.strictEqual(req.body, '{}');
  assert.strictEqual(onboard.signupRequest('https://x.example', 'Bran').body,
    JSON.stringify({ name: 'Bran' }));
});

test('classifySignup extracts the token on success (201 or 200)', () => {
  const ok = onboard.classifySignup(201, noHeader, JSON.stringify({ userId: 1, token: 'tok' }));
  assert.strictEqual(ok.kind, 'ok');
  assert.strictEqual(ok.token, 'tok');
  assert.strictEqual(onboard.classifySignup(200, noHeader, JSON.stringify({ token: 't2' })).token, 't2');
});

test('classifySignup flags a success with no usable token as an error', () => {
  assert.strictEqual(onboard.classifySignup(201, noHeader, '{}').kind, 'error');
  assert.strictEqual(onboard.classifySignup(201, noHeader, 'not json').kind, 'error');
});

test('classifySignup reports rate limiting with the retry delay', () => {
  const limited = onboard.classifySignup(429, (n) => (n === 'Retry-After' ? '120' : null), '');
  assert.strictEqual(limited.kind, 'rate_limited');
  assert.strictEqual(limited.retryAfter, 120);
  assert.match(limited.message, /120/);
});

test('classifySignup handles a missing Retry-After header', () => {
  const limited = onboard.classifySignup(429, noHeader, '');
  assert.strictEqual(limited.kind, 'rate_limited');
  assert.strictEqual(limited.retryAfter, null);
});

test('classifySignup surfaces server error detail, degrading to a bare status', () => {
  const bad = onboard.classifySignup(400, noHeader, JSON.stringify({ error: 'name missing' }));
  assert.strictEqual(bad.kind, 'error');
  assert.match(bad.message, /400/);
  assert.match(bad.message, /name missing/);
  assert.strictEqual(onboard.classifySignup(500, noHeader, '<html>').message, 'HTTP 500');
});

test('needsOverwriteConfirm only when a token already exists', () => {
  assert.ok(onboard.needsOverwriteConfirm('tok'));
  assert.ok(!onboard.needsOverwriteConfirm(''));
  assert.ok(!onboard.needsOverwriteConfirm('   '));
  assert.ok(!onboard.needsOverwriteConfirm(undefined));
});

test('the page default service URL matches the pkjs default (kept in sync)', () => {
  assert.strictEqual(onboard.DEFAULT_BASE_URL, config.DEFAULT_BASE_URL);
  assert.match(onboard.DEFAULT_BASE_URL, /^https:\/\//);
});

test('buildReturnUrl carries the trimmed token and theme and round-trips through config.parseResult', () => {
  const close = 'pebblejs://close#';
  const url = onboard.buildReturnUrl(close, '  tok  ', 1);
  assert.ok(url.indexOf(close) === 0);
  assert.deepStrictEqual(config.parseResult(url.slice(close.length)),
    { baseUrl: config.DEFAULT_BASE_URL, token: 'tok', theme: 1 });
  // A missing/unknown theme defaults to dark, and still round-trips.
  const darkUrl = onboard.buildReturnUrl(close, 'tok');
  assert.deepStrictEqual(config.parseResult(darkUrl.slice(close.length)),
    { baseUrl: config.DEFAULT_BASE_URL, token: 'tok', theme: 0 });
});
