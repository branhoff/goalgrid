'use strict';
var calendar = require('./calendar');
var config = require('./config');
var service = require('./service');
var wire = require('./wire');

var clock = calendar.localClock();

// Watch -> phone: REQUEST_GRID carries the watch's own local epoch day ("today").
// Phone -> watch: READY once the JS is up, then the grid. Every grid also carries THEME so the
// watch's saved theme stays in sync with the phone's (a no-op redraw when unchanged).
function sendGrid(data) {
  var message = { GRID_EPOCH_DAY: data.epochDay, GRID_NAMES: data.names, THEME: data.theme };
  if (data.types.length > 0) {
    // An empty array cannot ride in an AppMessage; no goals means no arrays at all.
    message.GRID_TYPES = data.types;
    message.GRID_VALUES = data.values;
  }
  Pebble.sendAppMessage(
    message,
    function () { console.log('grid delivered'); },
    function (e) { console.log('grid send failed: ' + JSON.stringify(e)); }
  );
}

function deliver(response, epochDay, theme) {
  try {
    var data = wire.toWire(response, epochDay, clock);
    data.theme = theme;
    sendGrid(data);
  } catch (e) {
    console.log('bad grid response: ' + e.message);
  }
}

// No goals means no TYPES/VALUES arrays: the watch draws a date-only, empty grid. Used when
// unconfigured or when the service rejects the token -- never fake data that could pass for real.
function sendEmptyGrid(epochDay, theme) {
  sendGrid({ epochDay: epochDay, names: '', types: [], values: [], theme: theme });
}

function handleRequest(epochDay) {
  var settings = config.load(localStorage);
  if (!config.isConfigured(settings)) {
    console.log('not configured: empty grid');
    return sendEmptyGrid(epochDay, settings.theme);
  }
  service.fetchGrid(settings, epochDay, clock, function (error, response) {
    if (error) {
      if (error.status === 401 || error.status === 403) {
        // Auth failure (missing/invalid/revoked/wrong-tenant token): clear the grid so a
        // stale one can't masquerade as live data. Transient errors keep the last grid.
        console.log('unauthorized: check token');
        return sendEmptyGrid(epochDay, settings.theme);
      }
      return console.log('grid fetch failed: ' + error.message);
    }
    deliver(response, epochDay, settings.theme);
  });
}

Pebble.addEventListener('ready', function () {
  Pebble.sendAppMessage({ READY: 1 });
});

Pebble.addEventListener('appmessage', function (e) {
  if (e.payload.REQUEST_GRID !== undefined) {
    handleRequest(e.payload.GRID_EPOCH_DAY);
  }
});

Pebble.addEventListener('showConfiguration', function () {
  Pebble.openURL(config.pageUrl(config.load(localStorage)));
});

Pebble.addEventListener('webviewclosed', function (e) {
  var saved = e.response ? config.parseResult(e.response) : null;
  if (saved) {
    config.save(localStorage, saved);
    // Push the theme straight away so the change shows without waiting for the next grid.
    Pebble.sendAppMessage({ THEME: saved.theme });
    console.log('settings saved');
  }
});
