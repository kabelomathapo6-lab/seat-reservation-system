// clock.js
// A very small helper for telling the time.
//
// Everywhere in the app that needs "the current time" calls clock.now()
// instead of Date.now() directly. Normally it just returns the real time.
//
// In tests we can replace now() with a fake time and jump it forward, so we
// can test things like "a hold expires after 60 seconds" instantly, without
// actually waiting 60 seconds. 

let currentTimeFunction = function () {
  return Date.now();
};

module.exports = {
  // Return the current time in milliseconds.
  now: function () {
    return currentTimeFunction();
  },

  // Used by tests to control the time. Pass a function that returns a number.
  setTimeFunction: function (fn) {
    currentTimeFunction = fn;
  },

  // Used by tests to go back to the real clock.
  useRealTime: function () {
    currentTimeFunction = function () {
      return Date.now();
    };
  }
};