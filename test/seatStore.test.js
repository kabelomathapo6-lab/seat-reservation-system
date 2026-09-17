// test/seatStore.test.js
// Automated tests for the seat reservation rules, using Node's built-in test
// runner (run with: npm test).
//
// We use the injectable clock so we can test time-based rules (like expiry)
// instantly, without waiting the real 60 seconds.

const test = require("node:test");
const assert = require("node:assert");

const store = require("./../seatStore");
const clock = require("./../clock");
const config = require("./../config");

// A small fake clock we control. We set fakeNow and move it forward by hand.
let fakeNow = 1000000;
clock.setTimeFunction(function () {
  return fakeNow;
});

// Before each test, reset the store and the fake time to a clean start.
test.beforeEach(function () {
  fakeNow = 1000000;
  store.reset();
});

// 1. Hold code format: 6 chars, only safe characters, never 0 O 1 I L.
test("hold code has the right format", function () {
  const result = store.holdSeat("a@test.com", 1);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.holdCode.length, 6);
  assert.match(result.holdCode, /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]+$/);
  assert.ok(!/[0O1IL]/.test(result.holdCode));
});

// 2. Hold codes are unique across active holds.
test("hold codes are unique", function () {
  const codes = {};
  for (let seat = 1; seat <= 10; seat++) {
    const r = store.holdSeat("user" + seat + "@test.com", seat);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(codes[r.holdCode], undefined);
    codes[r.holdCode] = true;
  }
});

// 3. A hold expires after the configured time.
test("a hold expires after the expiry time", function () {
  const r = store.holdSeat("a@test.com", 1);
  assert.strictEqual(r.ok, true);

  fakeNow = fakeNow + (config.holdExpirySeconds * 1000) + 1000;

  const state = store.getSeats();
  const seat1 = state.seats.find(function (s) { return s.seat === 1; });
  assert.strictEqual(seat1.status, "available");
});

// 4. A user cannot have more than the max concurrent holds.
test("max concurrent holds is enforced", function () {
  assert.strictEqual(store.holdSeat("a@test.com", 1).ok, true);
  assert.strictEqual(store.holdSeat("a@test.com", 2).ok, true);
  const third = store.holdSeat("a@test.com", 3);
  assert.strictEqual(third.ok, false);
  assert.strictEqual(third.rule, "max_concurrent");
});

// 5. Confirming is idempotent: confirming twice returns success, no error.
test("confirm is idempotent", function () {
  const held = store.holdSeat("a@test.com", 1);
  const first = store.confirmHold("a@test.com", held.holdCode);
  assert.strictEqual(first.ok, true);

  const second = store.confirmHold("a@test.com", held.holdCode);
  assert.strictEqual(second.ok, true);
  assert.strictEqual(second.alreadyConfirmed, true);
});

// 6. Waitlist promotion: when a held seat expires, the first waitlister gets it.
test("waitlist promotion gives a freed seat to the first in line", function () {
  for (let seat = 1; seat <= config.totalSeats; seat++) {
    store.holdSeat("owner" + seat + "@test.com", seat);
  }

  const w = store.joinWaitlist("waiter@test.com");
  assert.strictEqual(w.ok, true);

  fakeNow = fakeNow + (config.holdExpirySeconds * 1000) + 1000;
  store.expireHolds();

  const state = store.getSeats();
  assert.strictEqual(state.waitlist.length, 0);
  const waiterSeat = state.seats.find(function (s) {
    return s.email === "waiter@test.com" && s.status === "held";
  });
  assert.ok(waiterSeat);
});