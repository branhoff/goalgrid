'use strict';
// Pure conversion from ring-capture's GET /grid response (schema 2: raw UTC events) to the
// watch's wire format. The client buckets events into local days. No Pebble APIs, so it
// runs under node (tests/wire.test.js).

var calendar = require('./calendar');

var CAPACITY = 3 * 7;  // keep in sync with GOALGRID_CAPACITY in model/goalgrid.h
var MAX_GOALS = 5;     // GOALGRID_MAX_GOALS
var NAME_LEN = 15;     // GOALGRID_NAME_LEN - 1
var TYPE_CODES = { binary: 0, count: 1 };

function assertResponse(response) {
  if (!response || response.schema !== 2 || !Array.isArray(response.goals) || !response.series) {
    throw new Error('unsupported grid response');
  }
}

function typeCode(goal) {
  if (!Object.prototype.hasOwnProperty.call(TYPE_CODES, goal.type)) {
    throw new Error('unsupported goal type: ' + goal.type);
  }
  return TYPE_CODES[goal.type];
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

// One goal's CAPACITY bytes, index k = k days before today. Count goals sum their events'
// values within a local day; binary goals are 1 if any event falls in the day.
function dailyValues(goal, events, todayEpochDay, clock) {
  var totals = [];
  var k;
  for (k = 0; k < CAPACITY; k++) {
    totals.push(0);
  }
  (events || []).forEach(function (event) {
    var daysAgo = todayEpochDay - clock.dayOf(event.at);
    if (daysAgo >= 0 && daysAgo < CAPACITY) {
      totals[daysAgo] += goal.type === 'count' ? Math.max(0, Number(event.value) || 0) : 1;
    }
  });
  return totals.map(function (total) { return goal.type === 'count' ? clampByte(total) : Math.min(total, 1); });
}

// The watch defines "today" (todayEpochDay); the service has no notion of it.
function toWire(response, todayEpochDay, clock) {
  assertResponse(response);
  var goals = response.goals.slice().sort(function (a, b) { return a.number - b.number; })
    .slice(0, MAX_GOALS);
  var values = [];
  var types = goals.map(typeCode);
  goals.forEach(function (goal) {
    values = values.concat(dailyValues(goal, response.series[String(goal.id)], todayEpochDay, clock));
  });
  return {
    epochDay: todayEpochDay,
    types: types,
    names: goals.map(function (goal) {
      return String(goal.name).replace(/\n/g, ' ').slice(0, NAME_LEN);
    }).join('\n'),
    values: values
  };
}

// Demo mode: shift fixture instants by whole days so the response's last day (`to` is the
// exclusive end, in UTC) lands on today.
function rebaseToToday(response, todayEpochDay) {
  assertResponse(response);
  var shiftMs = (todayEpochDay - Math.floor((response.to - 1) / calendar.DAY_MS)) * calendar.DAY_MS;
  var series = {};
  Object.keys(response.series).forEach(function (id) {
    series[id] = response.series[id].map(function (event) {
      return { at: event.at + shiftMs, value: event.value };
    });
  });
  return { schema: response.schema, from: response.from + shiftMs, to: response.to + shiftMs,
           goals: response.goals, series: series };
}

module.exports = { toWire: toWire, rebaseToToday: rebaseToToday, CAPACITY: CAPACITY, MAX_GOALS: MAX_GOALS };
