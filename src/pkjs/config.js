'use strict';
// Service URL + token, stored in the phone's localStorage. Pure helpers plus the URL of the
// hosted settings/onboarding page (web/index.html); see tests/config.test.js.

var STORAGE_KEY = 'goalgridConfig';

// The hosted config page (GitHub Pages, served via the account's custom domain). A real origin
// is required: the page's Generate-token fetch needs a CORS-allowlistable origin, which a data:
// URL (opaque origin) cannot provide. github.io 301-redirects here, so this is the real origin.
var CONFIG_URL = 'https://brandon-hoffman.is-a.dev/goalgrid/';

// Prefilled into the settings page so a new user only has to generate a token. Not a secret
// (the token is); still editable in the field for anyone pointing at a different service.
var DEFAULT_BASE_URL = 'https://ring-capture-nnkovzej6q-uw.a.run.app';

function load(store) {
  try {
    var saved = JSON.parse(store.getItem(STORAGE_KEY));
    return { baseUrl: String(saved.baseUrl || ''), token: String(saved.token || '') };
  } catch (e) {
    return { baseUrl: '', token: '' };
  }
}

function save(store, config) {
  store.setItem(STORAGE_KEY, JSON.stringify(config));
}

function isConfigured(config) {
  // A token is mandatory now that the service is multi-tenant: no token always 401s, so an
  // unconfigured token means "not set up yet" (show demo), not "fetch and fail".
  return config.baseUrl !== '' && config.token !== '';
}

// Settings-page result: URI-encoded JSON. Returns null if it is not usable.
function parseResult(response) {
  try {
    var options = JSON.parse(decodeURIComponent(response));
    var baseUrl = String(options.baseUrl || '').replace(/\/+$/, '');
    if (!/^https?:\/\/[^\s/]+/.test(baseUrl)) {
      return null;
    }
    return { baseUrl: baseUrl, token: String(options.token || '') };
  } catch (e) {
    return null;
  }
}

// Opens the hosted page, prefilling the service URL and token in the fragment (never the query)
// so the secret token stays on the phone and out of the host's server logs. The page reads
// return_to from the query, which the Pebble app supplies.
function pageUrl(config) {
  var url = config.baseUrl || DEFAULT_BASE_URL;
  return CONFIG_URL + '#baseUrl=' + encodeURIComponent(url) +
    '&token=' + encodeURIComponent(config.token || '');
}

module.exports = {
  load: load, save: save, isConfigured: isConfigured, parseResult: parseResult,
  pageUrl: pageUrl, CONFIG_URL: CONFIG_URL, DEFAULT_BASE_URL: DEFAULT_BASE_URL
};
