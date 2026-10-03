'use strict';
var calendar = require('./calendar');
var config = require('./config');
var service = require('./service');
var wire = require('./wire');

var DEMO_FIXTURE = require('./fixtures/mixed.json');
var clock = calendar.localClock();

// Watch -> phone: REQUEST_GRID carries the watch's own local epoch day ("today").
// Phone -> watch: READY once the JS is up, then the grid.
function sendGrid(data) {
  var message = { GRID_EPOCH_DAY: data.epochDay, GRID_NAMES: data.names };
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

function deliver(response, epochDay) {
  try {
    sendGrid(wire.toWire(response, epochDay, clock));
  } catch (e) {
    console.log('bad grid response: ' + e.message);
  }
}

function handleRequest(epochDay) {
  var settings = config.load(localStorage);
  if (!config.isConfigured(settings)) {
    console.log('no service configured: demo data');
    return deliver(wire.rebaseToToday(DEMO_FIXTURE, epochDay), epochDay);
  }
  service.fetchGrid(settings, epochDay, clock, function (error, response) {
    if (error) {
      return console.log('grid fetch failed: ' + error.message);
    }
    deliver(response, epochDay);
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
    console.log('settings saved');
  }
});
