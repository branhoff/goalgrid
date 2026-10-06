'use strict';
const test = require('node:test');
const assert = require('node:assert');
const onboard = require('../web/onboard');
const config = require('../src/pkjs/config');

const noHeader = () => null;

test('parseParams reads the token from the fragment and return_to from the query', () => {
  const params = onboard.parseParams(
    '?return_to=' + encodeURIComponent('pebblejs://close#'),
    '#baseUrl=' + encodeURIComponent('https://x.example') + '&token=abc'
  );
  // The fragment's baseUrl is deliberately ignored (app-owned URL); only the token is read.
  assert.deepStrictEqual(params, { token: 'abc', returnTo: 'pebblejs://close#' });
});

test('parseParams defaults return_to and tolerates empty input', () => {
  assert.deepStrictEqual(onboard.parseParams('', ''),
    { token: '', returnTo: 'pebblejs://close#' });
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

test('parseAliases splits/trims a comma string and passes through an array', () => {
  assert.deepStrictEqual(onboard.parseAliases('jog, run ,,  '), ['jog', 'run']);
  assert.deepStrictEqual(onboard.parseAliases(['  a ', '', 'b']), ['a', 'b']);
  assert.deepStrictEqual(onboard.parseAliases(''), []);
  assert.deepStrictEqual(onboard.parseAliases(undefined), []);
});

test('goalRequest POSTs to /goals with the bearer token and a minimal body', () => {
  const req = onboard.goalRequest('https://x.example///', '  tok  ', { name: ' running ', type: 'binary' });
  assert.strictEqual(req.url, 'https://x.example/goals');
  assert.strictEqual(req.method, 'POST');
  // The token is trimmed into the header, matching the Save path, so stray whitespace can't 401.
  assert.strictEqual(req.headers['Authorization'], 'Bearer tok');
  assert.strictEqual(req.headers['Content-Type'], 'application/json');
  assert.deepStrictEqual(JSON.parse(req.body), { name: 'running', type: 'binary' });
});

test('goalRequest defaults unknown types to binary and includes aliases when present', () => {
  assert.strictEqual(JSON.parse(onboard.goalRequest('https://x.example', 't', { name: 'a' }).body).type,
    'binary');
  const counted = onboard.goalRequest('https://x.example', 't', { name: 'pushups', type: 'count', aliases: 'reps, pu' });
  assert.deepStrictEqual(JSON.parse(counted.body), { name: 'pushups', type: 'count', aliases: ['reps', 'pu'] });
});

test('classifyGoal reports created (201) vs existing (200) and surfaces the logHint', () => {
  const created = onboard.classifyGoal(201, JSON.stringify({
    goal: { id: 1, number: 1, name: 'running', type: 'binary' }, logHint: 'Say "log running done".'
  }));
  assert.strictEqual(created.kind, 'ok');
  assert.strictEqual(created.created, true);
  assert.match(created.message, /Created "running"/);
  assert.strictEqual(created.logHint, 'Say "log running done".');
  const existing = onboard.classifyGoal(200, JSON.stringify({ goal: { name: 'running', type: 'binary' } }));
  assert.strictEqual(existing.created, false);
  assert.match(existing.message, /already have "running"/);
});

test('classifyGoal flags 401, an unreadable success body, and other statuses as errors', () => {
  assert.strictEqual(onboard.classifyGoal(401, '').kind, 'error');
  assert.match(onboard.classifyGoal(401, '').message, /401/);
  assert.strictEqual(onboard.classifyGoal(201, 'not json').kind, 'error');
  assert.strictEqual(onboard.classifyGoal(201, JSON.stringify({})).kind, 'error');
  const bad = onboard.classifyGoal(400, JSON.stringify({ error: 'name required' }));
  assert.strictEqual(bad.kind, 'error');
  assert.match(bad.message, /name required/);
});

test('listGoalsRequest GETs /goals with the bearer token', () => {
  const req = onboard.listGoalsRequest('https://x.example/', '  tok  ');
  assert.strictEqual(req.url, 'https://x.example/goals');
  assert.strictEqual(req.method, 'GET');
  assert.strictEqual(req.headers['Authorization'], 'Bearer tok');
});

test('classifyGoalList extracts the goals array and flags bad responses', () => {
  const ok = onboard.classifyGoalList(200, JSON.stringify({ schema: 2, goals: [{ id: 1, name: 'a' }] }));
  assert.strictEqual(ok.kind, 'ok');
  assert.deepStrictEqual(ok.goals, [{ id: 1, name: 'a' }]);
  assert.strictEqual(onboard.classifyGoalList(200, 'not json').kind, 'error');
  assert.strictEqual(onboard.classifyGoalList(200, JSON.stringify({})).kind, 'error');
  assert.strictEqual(onboard.classifyGoalList(401, '').kind, 'error');
  assert.match(onboard.classifyGoalList(500, '<html>').message, /500/);
});

test('describeGoalLimits counts hidden goals past the watch cap and over-long names', () => {
  const few = onboard.describeGoalLimits([{ name: 'a' }, { name: 'b' }]);
  assert.deepStrictEqual(few, { total: 2, hidden: 0, longNames: [] });
  const many = onboard.describeGoalLimits(
    [1, 2, 3, 4, 5, 6, 7].map((n) => ({ name: 'g' + n })));
  assert.strictEqual(many.total, 7);
  assert.strictEqual(many.hidden, 2);
  const long = onboard.describeGoalLimits([{ name: 'this name is far too long for the watch' }]);
  assert.deepStrictEqual(long.longNames, ['this name is far too long for the watch']);
  assert.deepStrictEqual(onboard.describeGoalLimits(undefined), { total: 0, hidden: 0, longNames: [] });
});

test('buildReturnUrl carries only the trimmed token and round-trips through config.parseResult', () => {
  const close = 'pebblejs://close#';
  const url = onboard.buildReturnUrl(close, '  tok  ');
  assert.ok(url.indexOf(close) === 0);
  assert.deepStrictEqual(config.parseResult(url.slice(close.length)),
    { baseUrl: config.DEFAULT_BASE_URL, token: 'tok' });
});
