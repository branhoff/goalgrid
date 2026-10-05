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

  // Prefilled when the opener supplies no service URL (direct visit, or a lost prefill fragment).
  // Keep in sync with DEFAULT_BASE_URL in src/pkjs/config.js — separate deploy artifacts can't
  // share the constant; tests/onboard.test.js asserts they match.
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

  // Prefill (baseUrl/token) rides in the fragment so the secret token never reaches the
  // host's server logs; return_to comes from the query (how the Pebble app supplies it).
  function parseParams(search, hash) {
    var query = parsePairs(search);
    var frag = parsePairs(hash);
    return {
      baseUrl: frag.baseUrl || '',
      token: frag.token || '',
      returnTo: query.return_to || CLOSE_URL
    };
  }

  function signupRequest(serviceUrl, name) {
    var base = String(serviceUrl || '').replace(/\/+$/, '');
    var body = {};
    if (name) {
      body.name = String(name);
    }
    return {
      url: base + '/signup',
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

  function buildReturnUrl(returnTo, baseUrl, token) {
    var payload = { baseUrl: String(baseUrl || '').trim(), token: String(token || '').trim() };
    return returnTo + encodeURIComponent(JSON.stringify(payload));
  }

  return {
    DEFAULT_BASE_URL: DEFAULT_BASE_URL,
    parseParams: parseParams,
    signupRequest: signupRequest,
    classifySignup: classifySignup,
    needsOverwriteConfirm: needsOverwriteConfirm,
    buildReturnUrl: buildReturnUrl
  };
});
