var gridData = require('./grid_data');

var FIXTURES = [
  require('./fixtures/mixed.json'),
  require('./fixtures/weekdays_only.json'),
  require('./fixtures/streak_broken.json'),
  require('./fixtures/ramp_up.json'),
  require('./fixtures/sparse.json'),
  require('./fixtures/perfect.json'),
  require('./fixtures/empty.json'),
];
var STORAGE_KEY = 'fixtureIndex';

function currentIndex() {
  var i = parseInt(localStorage.getItem(STORAGE_KEY), 10);
  return isNaN(i) ? 0 : ((i % FIXTURES.length) + FIXTURES.length) % FIXTURES.length;
}

function localToday() {
  var now = new Date();
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000;
}

function sendGrid() {
  var fixture = FIXTURES[currentIndex()];
  var wire = gridData.toWireFormat(fixture, localToday());
  console.log('sending fixture: ' + fixture.name);
  Pebble.sendAppMessage(
    { GRID_EPOCH_DAY: wire.epochDay, GRID_DAYS: wire.bytes },
    function () { console.log('grid delivered'); },
    function (e) { console.log('grid send failed: ' + JSON.stringify(e)); }
  );
}

Pebble.addEventListener('ready', sendGrid);

// The watch asks to step through fixtures (UP/DOWN) to review the UI quickly.
Pebble.addEventListener('appmessage', function (e) {
  var step = e.payload.FIXTURE_STEP;
  if (step !== undefined) {
    localStorage.setItem(STORAGE_KEY, String(currentIndex() + (step > 0 ? 1 : -1)));
    sendGrid();
  }
});
