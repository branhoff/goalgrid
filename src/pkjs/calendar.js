'use strict';
// The client owns the calendar: the service stores raw UTC instants, and this module
// decides which local day an instant belongs to. A "clock" is {dayOf, midnight} so the
// logic is testable in any timezone; localClock() is the phone's own timezone.

var DAY_MS = 86400000;

function civilDate(epochDay) {
  var utc = new Date(epochDay * DAY_MS);
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth(), day: utc.getUTCDate() };
}

// The phone's timezone, DST included (local getters and local-midnight construction).
function localClock() {
  return {
    dayOf: function (at) {
      var d = new Date(at);
      return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS;
    },
    midnight: function (epochDay) {
      var c = civilDate(epochDay);
      return new Date(c.year, c.month, c.day).getTime();
    }
  };
}

// A constant offset in minutes east of UTC, for tests and tools.
function fixedClock(offsetMinutes) {
  var offsetMs = offsetMinutes * 60000;
  return {
    dayOf: function (at) { return Math.floor((at + offsetMs) / DAY_MS); },
    midnight: function (epochDay) { return epochDay * DAY_MS - offsetMs; }
  };
}

// Half-open instant window [from, to) covering the `days` local days ending on today.
function dayWindow(clock, todayEpochDay, days) {
  return { from: clock.midnight(todayEpochDay - (days - 1)), to: clock.midnight(todayEpochDay + 1) };
}

module.exports = { localClock: localClock, fixedClock: fixedClock, dayWindow: dayWindow, DAY_MS: DAY_MS };
