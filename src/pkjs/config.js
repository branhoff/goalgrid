'use strict';
// Service URL + token, stored in the phone's localStorage. Pure helpers plus a
// hand-written settings page (no Clay dependency); see tests/config.test.js.

var STORAGE_KEY = 'goalgridConfig';

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
  return config.baseUrl !== '';
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

function escapeAttr(text) {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function pageHtml(config) {
  return '<!DOCTYPE html><meta name="viewport" content="width=device-width">' +
    '<body style="font-family:sans-serif;padding:1em"><h3>Goal Grid</h3>' +
    '<p>Service URL<br><input id="u" style="width:100%" value="' + escapeAttr(config.baseUrl) + '"></p>' +
    '<p>Token<br><input id="t" type="password" style="width:100%" value="' + escapeAttr(config.token) + '"></p>' +
    '<button onclick="save()">Save</button><script>' +
    'function q(k){var m=location.search.substring(1).split("&");for(var i=0;i<m.length;i++){' +
    'var p=m[i].split("=");if(p[0]===k)return decodeURIComponent(p[1]);}return "pebblejs://close#";}' +
    'function save(){document.location=q("return_to")+encodeURIComponent(JSON.stringify(' +
    '{baseUrl:document.getElementById("u").value.trim(),token:document.getElementById("t").value.trim()}));}' +
    '</script>';
}

function pageUrl(config) {
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(pageHtml(config));
}

module.exports = {
  load: load, save: save, isConfigured: isConfigured, parseResult: parseResult,
  pageUrl: pageUrl, pageHtml: pageHtml
};
