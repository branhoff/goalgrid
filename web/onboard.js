// Pure, framework-free helpers for the hosted config/onboarding page (web/index.html).
// No fetch/DOM here so it stays node-testable (tests/onboard.test.js) and is held to the
// same coverage bar as the pkjs model. Loads both as a <script> (window.onboard) and under
// node (require). The return payload matches src/pkjs/config.js parseResult exactly.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.onboard = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CLOSE_URL = 'pebblejs://close#';

  // Mirror the watch's limits (GOALGRID_MAX_GOALS, GOALGRID_NAME_LEN - 1 in model/goalgrid.h)
  // so the page can warn when goals won't all fit or a name will be truncated on-watch.
  var WATCH_MAX_GOALS = 5;
  var WATCH_NAME_LEN = 15;

  // The app-owned service URL the page pins for Generate and Copy (the fragment's baseUrl is
  // never trusted). Keep in sync with DEFAULT_BASE_URL in src/pkjs/config.js — separate deploy
  // artifacts can't share the constant; tests/onboard.test.js asserts they match.
  var DEFAULT_BASE_URL = 'https://ring-capture-859396441579.us-west1.run.app';

  function safeDecode(value) {
    try {
      return decodeURIComponent(value);
    } catch (e) {
      return value;
    }
  }

  // Parse a "a=1&b=2" query/fragment string (leading ? or # tolerated) into an object.
  function parsePairs(text) {
    var out = {};
    var body = String(text || '').replace(/^[?#]/, '');
    if (body === '') {
      return out;
    }
    var parts = body.split('&');
    for (var i = 0; i < parts.length; i++) {
      var kv = parts[i].split('=');
      var key = safeDecode(kv[0]);
      out[key] = kv.length > 1 ? safeDecode(kv.slice(1).join('=')) : '';
    }
    return out;
  }

  // The token prefill rides in the fragment so the secret never reaches the host's server logs;
  // return_to comes from the query (how the Pebble app supplies it). The service URL is never
  // read from the fragment — it is app-owned, so the page pins its own DEFAULT_BASE_URL.
  function parseParams(search, hash) {
    var query = parsePairs(search);
    var frag = parsePairs(hash);
    return {
      token: frag.token || '',
      returnTo: query.return_to || CLOSE_URL
    };
  }

  function baseOf(serviceUrl) {
    return String(serviceUrl || '').replace(/\/+$/, '');
  }

  function signupRequest(serviceUrl, name) {
    var body = {};
    if (name) {
      body.name = String(name);
    }
    return {
      url: baseOf(serviceUrl) + '/signup',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    };
  }

  function failureMessage(status, bodyText) {
    var detail = '';
    try {
      detail = JSON.parse(bodyText).error || '';
    } catch (e) {
      detail = '';
    }
    return 'HTTP ' + status + (detail ? ': ' + detail : '');
  }

  // getHeader(name) lets the caller read Retry-After from either fetch Headers or an XHR.
  function classifySignup(status, getHeader, bodyText) {
    if (status === 200 || status === 201) {
      var token = '';
      try {
        token = String(JSON.parse(bodyText).token || '');
      } catch (e) {
        token = '';
      }
      if (token) {
        return { kind: 'ok', token: token, message: 'Token generated.' };
      }
      return { kind: 'error', message: 'Signup succeeded but returned no token.' };
    }
    if (status === 429) {
      var secs = parseInt(getHeader('Retry-After'), 10);
      var known = !isNaN(secs);
      return {
        kind: 'rate_limited',
        retryAfter: known ? secs : null,
        message: 'Too many signups from your network.' + (known ? ' Try again in ' + secs + 's.' : '')
      };
    }
    return { kind: 'error', message: failureMessage(status, bodyText) };
  }

  // Generating again mints a new identity and orphans the old token's data, so confirm first.
  function needsOverwriteConfirm(currentToken) {
    return String(currentToken || '').trim() !== '';
  }

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

  // The URL is read-only on the page (app-owned), so Save only returns the token.
  function buildReturnUrl(returnTo, token) {
    return returnTo + encodeURIComponent(JSON.stringify({ token: String(token || '').trim() }));
  }

  return {
    DEFAULT_BASE_URL: DEFAULT_BASE_URL,
    WATCH_MAX_GOALS: WATCH_MAX_GOALS,
    WATCH_NAME_LEN: WATCH_NAME_LEN,
    parseParams: parseParams,
    signupRequest: signupRequest,
    classifySignup: classifySignup,
    needsOverwriteConfirm: needsOverwriteConfirm,
    parseAliases: parseAliases,
    goalRequest: goalRequest,
    classifyGoal: classifyGoal,
    listGoalsRequest: listGoalsRequest,
    classifyGoalList: classifyGoalList,
    describeGoalLimits: describeGoalLimits,
    buildReturnUrl: buildReturnUrl
  };
});
