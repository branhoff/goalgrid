'use strict';
// Fetches GET /grid from ring-capture (schema 2). The request object is injectable so this
// runs under node with a fake (tests/service.test.js).

var calendar = require('./calendar');
var wire = require('./wire');
var TIMEOUT_MS = 10000;

// The watch defines "today"; the window is the local days ending on it, as UTC instants.
function gridUrl(baseUrl, todayEpochDay, clock) {
  var window = calendar.dayWindow(clock, todayEpochDay, wire.CAPACITY);
  return baseUrl.replace(/\/+$/, '') + '/grid?from=' + window.from + '&to=' + window.to;
}

function failureMessage(request) {
  var detail = '';
  try {
    detail = JSON.parse(request.responseText).error || '';
  } catch (e) {
    detail = '';
  }
  return 'HTTP ' + request.status + (detail ? ': ' + detail : '');
}

function fetchGrid(config, todayEpochDay, clock, callback, makeRequest) {
  var request = (makeRequest || function () { return new XMLHttpRequest(); })();
  var finished = false;
  function finish(error, data) {
    if (!finished) {
      finished = true;
      callback(error, data);
    }
  }
  request.open('GET', gridUrl(config.baseUrl, todayEpochDay, clock));
  if (config.token) {
    request.setRequestHeader('Authorization', 'Bearer ' + config.token);
  }
  request.timeout = TIMEOUT_MS;
  request.onload = function () {
    if (request.status !== 200) {
      return finish(new Error(failureMessage(request)));
    }
    try {
      finish(null, JSON.parse(request.responseText));
    } catch (e) {
      finish(new Error('invalid JSON from service'));
    }
  };
  request.onerror = function () { finish(new Error('network error')); };
  request.ontimeout = function () { finish(new Error('timed out')); };
  request.send();
}

module.exports = { fetchGrid: fetchGrid, gridUrl: gridUrl };
