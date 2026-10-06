// Pure, framework-free helpers for the hosted config/onboarding page (web/index.html):
// token/signup logic and the return payload. Goal helpers live in web/goals.js, which
// reuses baseOf/failureMessage from here. No fetch/DOM, so this stays node-testable
// (tests/onboard.test.js) and held to the same coverage bar as the pkjs model. Loads as a
// <script> (window.onboard) and under node (require). The return payload matches
// src/pkjs/config.js parseResult exactly.
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

  // The app-owned service URL the page pins for Generate and Copy (the fragment's baseUrl is
  // never trusted). Keep in sync with DEFAULT_BASE_URL in src/pkjs/config.js - separate deploy
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
  // read from the fragment - it is app-owned, so the page pins its own DEFAULT_BASE_URL.
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

  // The URL is read-only on the page (app-owned), so Save only returns the token.
  function buildReturnUrl(returnTo, token) {
    return returnTo + encodeURIComponent(JSON.stringify({ token: String(token || '').trim() }));
  }

  return {
    DEFAULT_BASE_URL: DEFAULT_BASE_URL,
    baseOf: baseOf,
    failureMessage: failureMessage,
    parseParams: parseParams,
    signupRequest: signupRequest,
    classifySignup: classifySignup,
    needsOverwriteConfirm: needsOverwriteConfirm,
    buildReturnUrl: buildReturnUrl
  };
});
