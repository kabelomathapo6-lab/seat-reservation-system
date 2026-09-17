// config.js
// All the settings live here so they are easy to change.


module.exports = {
  totalSeats: 20,           // an event has this many seats, numbered from 1
  holdExpirySeconds: 60,    // a hold expires after this many seconds
  maxConcurrentHolds: 2,    // most active (unconfirmed) holds a user can have at once
  maxHoldsPerHour: 5,       // most holds a user can place in an hour (any outcome)
  maxExtensions: 2,         // a hold cannot be extended more than this many times
  holdCodeLength: 6         // hold codes are 6 characters long
};