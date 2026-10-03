// Pure conversion from the fixture/service schema to the watch wire format.
// No Pebble APIs here so it can run under node (tests/test_grid_data.js).

var CAPACITY = 3 * 7;     // keep in sync with GOALGRID_CAPACITY in model/goalgrid.h

function epochDay(isoDate) {
  var p = isoDate.split('-');
  return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000;
}

// Returns a flat byte array: [completed, total] per day, index 0 = today.
// The newest day in `data` is treated as `todayEpochDay`.
function toWireFormat(data, todayEpochDay) {
  if (!data || data.version !== 1) {
    throw new Error('unsupported data version');
  }
  var total = data.goals.length;
  var known = {};
  data.goals.forEach(function (g) { known[g.id] = true; });

  var newest = 0;
  data.days.forEach(function (d) { newest = Math.max(newest, epochDay(d.date)); });

  var bytes = [];
  for (var i = 0; i < CAPACITY * 2; i += 2) {
    bytes.push(0, total);
  }
  data.days.forEach(function (d) {
    var daysAgo = newest - epochDay(d.date);
    if (daysAgo < 0 || daysAgo >= CAPACITY) {
      return;
    }
    var done = d.completed.filter(function (id, idx, all) {
      return known[id] && all.indexOf(id) === idx;  // ignore unknown/duplicate ids
    }).length;
    bytes[daysAgo * 2] = done;
  });
  return { epochDay: todayEpochDay, bytes: bytes };
}

module.exports = { toWireFormat: toWireFormat, CAPACITY: CAPACITY };
