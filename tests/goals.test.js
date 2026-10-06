'use strict';
const test = require('node:test');
const assert = require('node:assert');
const goals = require('../web/goals');

test('parseAliases splits/trims a comma string and passes through an array', () => {
  assert.deepStrictEqual(goals.parseAliases('jog, run ,,  '), ['jog', 'run']);
  assert.deepStrictEqual(goals.parseAliases(['  a ', '', 'b']), ['a', 'b']);
  assert.deepStrictEqual(goals.parseAliases(''), []);
  assert.deepStrictEqual(goals.parseAliases(undefined), []);
});

test('goalRequest POSTs to /goals with the bearer token and a minimal body', () => {
  // The base URL is normalised by onboard.baseOf, which goals reuses rather than duplicating.
  const req = goals.goalRequest('https://x.example///', '  tok  ', { name: ' running ', type: 'binary' });
  assert.strictEqual(req.url, 'https://x.example/goals');
  assert.strictEqual(req.method, 'POST');
  // The token is trimmed into the header, matching the Save path, so stray whitespace can't 401.
  assert.strictEqual(req.headers['Authorization'], 'Bearer tok');
  assert.strictEqual(req.headers['Content-Type'], 'application/json');
  assert.deepStrictEqual(JSON.parse(req.body), { name: 'running', type: 'binary' });
});

test('goalRequest defaults unknown types to binary and includes aliases when present', () => {
  assert.strictEqual(JSON.parse(goals.goalRequest('https://x.example', 't', { name: 'a' }).body).type,
    'binary');
  const counted = goals.goalRequest('https://x.example', 't', { name: 'pushups', type: 'count', aliases: 'reps, pu' });
  assert.deepStrictEqual(JSON.parse(counted.body), { name: 'pushups', type: 'count', aliases: ['reps', 'pu'] });
});

test('classifyGoal reports created (201) vs existing (200) and surfaces the logHint', () => {
  const created = goals.classifyGoal(201, JSON.stringify({
    goal: { id: 1, number: 1, name: 'running', type: 'binary' }, logHint: 'Say "log running done".'
  }));
  assert.strictEqual(created.kind, 'ok');
  assert.strictEqual(created.created, true);
  assert.match(created.message, /Created "running"/);
  assert.strictEqual(created.logHint, 'Say "log running done".');
  const existing = goals.classifyGoal(200, JSON.stringify({ goal: { name: 'running', type: 'binary' } }));
  assert.strictEqual(existing.created, false);
  assert.match(existing.message, /already have "running"/);
});

test('classifyGoal flags 401, an unreadable success body, and other statuses as errors', () => {
  assert.strictEqual(goals.classifyGoal(401, '').kind, 'error');
  assert.match(goals.classifyGoal(401, '').message, /401/);
  assert.strictEqual(goals.classifyGoal(201, 'not json').kind, 'error');
  assert.strictEqual(goals.classifyGoal(201, JSON.stringify({})).kind, 'error');
  const bad = goals.classifyGoal(400, JSON.stringify({ error: 'name required' }));
  assert.strictEqual(bad.kind, 'error');
  // failureMessage is reused from onboard, so the server detail still surfaces.
  assert.match(bad.message, /name required/);
});

test('listGoalsRequest GETs /goals with the bearer token', () => {
  const req = goals.listGoalsRequest('https://x.example/', '  tok  ');
  assert.strictEqual(req.url, 'https://x.example/goals');
  assert.strictEqual(req.method, 'GET');
  assert.strictEqual(req.headers['Authorization'], 'Bearer tok');
});

test('classifyGoalList extracts the goals array and flags bad responses', () => {
  const ok = goals.classifyGoalList(200, JSON.stringify({ schema: 2, goals: [{ id: 1, name: 'a' }] }));
  assert.strictEqual(ok.kind, 'ok');
  assert.deepStrictEqual(ok.goals, [{ id: 1, name: 'a' }]);
  assert.strictEqual(goals.classifyGoalList(200, 'not json').kind, 'error');
  assert.strictEqual(goals.classifyGoalList(200, JSON.stringify({})).kind, 'error');
  assert.strictEqual(goals.classifyGoalList(401, '').kind, 'error');
  assert.match(goals.classifyGoalList(500, '<html>').message, /500/);
});

test('describeGoalLimits counts hidden goals past the watch cap and over-long names', () => {
  const few = goals.describeGoalLimits([{ name: 'a' }, { name: 'b' }]);
  assert.deepStrictEqual(few, { total: 2, hidden: 0, longNames: [] });
  const many = goals.describeGoalLimits(
    [1, 2, 3, 4, 5, 6, 7].map((n) => ({ name: 'g' + n })));
  assert.strictEqual(many.total, 7);
  assert.strictEqual(many.hidden, 2);
  const long = goals.describeGoalLimits([{ name: 'this name is far too long for the watch' }]);
  assert.deepStrictEqual(long.longNames, ['this name is far too long for the watch']);
  assert.deepStrictEqual(goals.describeGoalLimits(undefined), { total: 0, hidden: 0, longNames: [] });
});
