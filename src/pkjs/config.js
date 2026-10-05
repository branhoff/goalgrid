'use strict';
// The user's token (stored in the phone's localStorage) plus the app-owned service URL and the
// URL of the hosted settings/onboarding page (web/index.html); see tests/config.test.js.

var STORAGE_KEY = 'goalgridConfig';

// The hosted config page (GitHub Pages, served via the account's custom domain). A real origin
// is required: the page's Generate-token fetch needs a CORS-allowlistable origin, which a data:
// URL (opaque origin) cannot provide. github.io 301-redirects here, so this is the real origin.
var CONFIG_URL = 'https://brandon-hoffman.is-a.dev/goalgrid/';

// The app-owned service URL: shown read-only on the settings page and used for every fetch, so a
// new app version re-points existing installs. Not a secret (the token is). Keep in sync with
// DEFAULT_BASE_URL in web/onboard.js (separate deploy artifacts; tests/onboard.test.js checks it).
var DEFAULT_BASE_URL = 'https://ring-capture-859396441579.us-west1.run.app';

function load(store) {
  var token = '';
  var override = '';
  try {
    var stored = JSON.parse(store.getItem(STORAGE_KEY));
    token = String(stored.token || '');
    // Dev-only escape hatch written by tools/set_config.py to point the emulator at a local or
    // staging service. End users never set it (the page saves only a token), so their installs
    // always fall through to the app URL and re-point on a new app version. A stale legacy
    // `baseUrl` key from older builds is deliberately ignored, so those installs re-point too.
    override = String(stored.baseUrlOverride || '');
  } catch (e) {
    token = '';
    override = '';
  }
  // The service URL is owned by the app build, not the user: default to the current URL so a new
  // app version re-points existing installs. Only the token (and the dev override) are stored.
  return { baseUrl: override || DEFAULT_BASE_URL, token: token };
}

function save(store, config) {
  // Persist only the token; the URL comes from the app, never from stored state.
  store.setItem(STORAGE_KEY, JSON.stringify({ token: String(config.token || '') }));
}

function isConfigured(config) {
  // The token is the only thing a user sets and it is mandatory (the multi-tenant service 401s
  // without it); the URL is always present. No token means "not set up yet" -> empty grid.
  return config.token !== '';
}

// Settings-page result: URI-encoded JSON. The page can only change the token (the URL is
// read-only there, owned by the app), so keep the app's URL and take the token. A payload that
// isn't an object with a string token is rejected (null) rather than silently clearing the token.
function parseResult(response) {
  try {
    var options = JSON.parse(decodeURIComponent(response));
    if (!options || typeof options.token !== 'string') {
      return null;
    }
    return { baseUrl: DEFAULT_BASE_URL, token: options.token };
  } catch (e) {
    return null;
  }
}

// Opens the hosted page, handing it the saved token in the fragment (never the query) so the
// secret token stays on the phone and out of the host's server logs. The service URL is not sent:
// the page is app-owned and pins its own copy of DEFAULT_BASE_URL. return_to rides in the query,
// which the Pebble app supplies.
function pageUrl(config) {
  return CONFIG_URL + '#token=' + encodeURIComponent(config.token || '');
}

module.exports = {
  load: load, save: save, isConfigured: isConfigured, parseResult: parseResult,
  pageUrl: pageUrl, CONFIG_URL: CONFIG_URL, DEFAULT_BASE_URL: DEFAULT_BASE_URL
};
