// Pure helpers for the config page's Goals section (web/index.html): building the
// /goals requests and classifying their responses. Depends on web/onboard.js for the
// shared baseOf/failureMessage (and loads after it), so neither file duplicates them.
// No fetch/DOM here, so it stays node-testable (tests/goals.test.js) at the same
// coverage bar. Loads as a <script> (window.goals) and under node (require).
(function (root) {
  'use strict';
  var onboard = typeof require === 'function' ? require('./onboard') : root.onboard;
  var baseOf = onboard.baseOf;
  var failureMessage = onboard.failureMessage;

  // Mirror the watch's limits (GOALGRID_MAX_GOALS, GOALGRID_NAME_LEN - 1 in model/goalgrid.h)
  // so the page can warn when goals won't all fit or a name will be truncated on-watch.
  var WATCH_MAX_GOALS = 5;
  var WATCH_NAME_LEN = 15;

  // A comma-separated string (or an array) of alternate spoken phrases -> a clean string array.
  function parseAliases(value) {
    var list = Array.isArray(value) ? value : String(value || '').split(',');
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var alias = String(list[i]).trim();
      if (alias) {
        out.push(alias);
      }
    }
    return out;
  }

  // POST /goals with the bearer token. type defaults to binary (matching the service); aliases
  // are omitted when empty so the body stays minimal.
  function goalRequest(serviceUrl, token, goal) {
    var body = {
      name: String((goal && goal.name) || '').trim(),
      type: (goal && goal.type) === 'count' ? 'count' : 'binary'
    };
    var aliases = parseAliases(goal && goal.aliases);
    if (aliases.length) {
      body.aliases = aliases;
    }
    return {
      url: baseOf(serviceUrl) + '/goals',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + String(token || '').trim() },
      body: JSON.stringify(body)
    };
  }

  // POST /goals response: 201 = created, 200 = an existing goal with the same name was returned
  // (idempotent). Surfaces the service's logHint (the exact phrase to speak to the ring).
  function classifyGoal(status, bodyText) {
    if (status === 200 || status === 201) {
      var data = null;
      try {
        data = JSON.parse(bodyText);
      } catch (e) {
        data = null;
      }
      if (data && data.goal && data.goal.name) {
        return {
          kind: 'ok',
          created: status === 201,
          goal: data.goal,
          logHint: String(data.logHint || ''),
          message: (status === 201 ? 'Created "' : 'You already have "') + data.goal.name + '".'
        };
      }
      return { kind: 'error', message: 'Goal saved but the response was unreadable.' };
    }
    if (status === 401) {
      return { kind: 'error', message: 'The token was rejected (401). Generate or paste a valid token first.' };
    }
    return { kind: 'error', message: failureMessage(status, bodyText) };
  }

  function listGoalsRequest(serviceUrl, token) {
    return {
      url: baseOf(serviceUrl) + '/goals',
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + String(token || '').trim() }
    };
  }

  // GET /goals response: { schema: 2, goals: [...] }.
  function classifyGoalList(status, bodyText) {
    if (status === 200) {
      var data = null;
      try {
        data = JSON.parse(bodyText);
      } catch (e) {
        data = null;
      }
      if (data && Array.isArray(data.goals)) {
        return { kind: 'ok', goals: data.goals };
      }
      return { kind: 'error', message: 'Could not read the goal list.' };
    }
    if (status === 401) {
      return { kind: 'error', message: 'The token was rejected (401).' };
    }
    return { kind: 'error', message: failureMessage(status, bodyText) };
  }

  // What won't fit on the watch: goals past the first WATCH_MAX_GOALS (by service order) are
  // dropped, and names longer than WATCH_NAME_LEN are truncated in the grid.
  function describeGoalLimits(goals) {
    var list = Array.isArray(goals) ? goals : [];
    var longNames = [];
    for (var i = 0; i < list.length; i++) {
      if (String((list[i] && list[i].name) || '').length > WATCH_NAME_LEN) {
        longNames.push(list[i].name);
      }
    }
    return { total: list.length, hidden: Math.max(0, list.length - WATCH_MAX_GOALS), longNames: longNames };
  }

  var api = {
    WATCH_MAX_GOALS: WATCH_MAX_GOALS,
    WATCH_NAME_LEN: WATCH_NAME_LEN,
    parseAliases: parseAliases,
    goalRequest: goalRequest,
    classifyGoal: classifyGoal,
    listGoalsRequest: listGoalsRequest,
    classifyGoalList: classifyGoalList,
    describeGoalLimits: describeGoalLimits
  };
  if (typeof module === 'object' && module.exports) { module.exports = api; } else { root.goals = api; }
})(typeof self !== 'undefined' ? self : this);
