// seatStore.js
// This file holds all the seat reservation rules and the state, in memory.
// The server just calls these functions. Keeping the rules here (not in the
// server) means we could swap the in-memory state for a database later
// without changing the rules.
//
// "In memory" means everything is kept in normal variables, so it resets when
// the server restarts. That is fine for this test.

const config = require("./config");
const clock = require("./clock");

// ---- The state ----

// One record per seat. Seat numbers are 1 to totalSeats.
// seats[number] = {
//   status: "available" | "held" | "confirmed",
//   email: who holds/confirmed it (or null),
//   holdCode: the current hold code (or null),
//   expiresAt: when the hold expires (or null; confirmed seats do not expire),
//   extensions: how many times this hold has been extended
// }
const seats = {};

// The waitlist: a list of emails, in the order they joined.
let waitlist = [];

// The event log: an append-only list of everything that happened.
const eventLog = [];

// Per-user record of hold times in the last hour (for the hourly limit).
// holdHistory[email] = [ <time>, <time>, ... ]
const holdHistory = {};

// Set up all seats as available at the start.
function setupSeats() {
  for (let number = 1; number <= config.totalSeats; number++) {
    seats[number] = {
      status: "available",
      email: null,
      holdCode: null,
      expiresAt: null,
      extensions: 0
    };
  }
}
setupSeats();

// ---- Helpers ----

// Add a line to the event log with a timestamp.
function logEvent(type, seatNumber, email, extra) {
  eventLog.push({
    time: clock.now(),
    type: type,               // e.g. "hold_placed", "confirmed", "expired"
    seat: seatNumber,
    email: email,
    details: extra || ""
  });
}

// The safe alphabet for hold codes: uppercase letters and digits,
// with 0, O, 1, I and L removed because they are easily confused.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

// Make one random 6-character code from the safe alphabet.
function makeOneCode() {
  let code = "";
  for (let i = 0; i < config.holdCodeLength; i++) {
    const index = Math.floor(Math.random() * CODE_ALPHABET.length);
    code = code + CODE_ALPHABET[index];
  }
  return code;
}

// Get all hold codes that are currently in use (held or confirmed seats).
function activeCodes() {
  const codes = [];
  for (const number in seats) {
    if (seats[number].holdCode) {
      codes.push(seats[number].holdCode);
    }
  }
  return codes;
}

// Make a hold code that is not already used by an active hold.
function makeUniqueCode() {
  let code = makeOneCode();
  while (activeCodes().includes(code)) {
    code = makeOneCode();
  }
  return code;
}

// Count how many active (held, unconfirmed) holds a user has right now.
function countActiveHolds(email) {
  let count = 0;
  for (const number in seats) {
    if (seats[number].status === "held" && seats[number].email === email) {
      count++;
    }
  }
  return count;
}

// Does this user currently have any hold or confirmed seat?
function userHasSeat(email) {
  for (const number in seats) {
    const s = seats[number];
    if ((s.status === "held" || s.status === "confirmed") && s.email === email) {
      return true;
    }
  }
  return false;
}

// Check the hourly hold limit. Returns true if the user may place another hold.
function underHourlyLimit(email) {
  const cutoff = clock.now() - 60 * 60 * 1000;
  const recent = (holdHistory[email] || []).filter(function (t) {
    return t >= cutoff;
  });
  holdHistory[email] = recent;
  return recent.length < config.maxHoldsPerHour;
}

// Find the seat that a given email + hold code refers to. Returns the seat
// number, or null if no active seat matches.
function findSeatByCode(email, holdCode) {
  for (const number in seats) {
    const s = seats[number];
    if (s.holdCode === holdCode && s.email === email &&
        (s.status === "held" || s.status === "confirmed")) {
      return Number(number);
    }
  }
  return null;
}

// Make a seat available again (used on release and expiry).
function freeSeat(number) {
  seats[number].status = "available";
  seats[number].email = null;
  seats[number].holdCode = null;
  seats[number].expiresAt = null;
  seats[number].extensions = 0;
}

// ---- Expiry and waitlist promotion ----

// Place an automatic hold for the first person on the waitlist, if any.
// Called when a seat becomes free. This does NOT count toward their hourly limit.
function promoteFromWaitlist(number) {
  if (waitlist.length === 0) {
    return;
  }
  const email = waitlist.shift(); // take the first person, remove from waitlist
  const code = makeUniqueCode();
  seats[number] = {
    status: "held",
    email: email,
    holdCode: code,
    expiresAt: clock.now() + config.holdExpirySeconds * 1000,
    extensions: 0
  };
  logEvent("waitlist_promoted", number, email, "code " + code);
  // "Notify" the user by logging a clear message (a real system could email).
  console.log("NOTIFY " + email + ": you got seat " + number + ", hold code " + code);
}

// Free any holds that have expired, then promote the waitlist onto them.
// This is called on a timer and also before we read/act on state, so an
// expired hold is never treated as valid.
function expireHolds() {
  const now = clock.now();
  for (const number in seats) {
    const s = seats[number];
    if (s.status === "held" && s.expiresAt !== null && now > s.expiresAt) {
      const email = s.email;
      logEvent("expired", Number(number), email, "");
      freeSeat(Number(number));
      promoteFromWaitlist(Number(number));
    }
  }
}

// ---- The actions ----
// Each action returns either { ok: true, ... } or { ok: false, rule: "...",
// message: "..." } so the server can tell the client which rule was violated.

// Place a hold on a seat.
function holdSeat(email, seatNumber) {
  expireHolds();

  if (!seats[seatNumber]) {
    return { ok: false, rule: "seat_exists", message: "That seat does not exist." };
  }
  if (seats[seatNumber].status !== "available") {
    return { ok: false, rule: "seat_taken", message: "That seat is not available." };
  }
  if (countActiveHolds(email) >= config.maxConcurrentHolds) {
    return { ok: false, rule: "max_concurrent", message: "You already have the maximum number of active holds." };
  }
  if (!underHourlyLimit(email)) {
    return { ok: false, rule: "max_per_hour", message: "You have placed too many holds this hour." };
  }

  const code = makeUniqueCode();
  seats[seatNumber] = {
    status: "held",
    email: email,
    holdCode: code,
    expiresAt: clock.now() + config.holdExpirySeconds * 1000,
    extensions: 0
  };
  holdHistory[email] = holdHistory[email] || [];
  holdHistory[email].push(clock.now());
  logEvent("hold_placed", seatNumber, email, "code " + code);

  return { ok: true, seat: seatNumber, holdCode: code };
}

// Extend a hold before it expires.
function extendHold(email, holdCode) {
  expireHolds();

  const number = findSeatByCode(email, holdCode);
  if (number === null) {
    return { ok: false, rule: "not_found", message: "No active hold matches that email and code." };
  }
  const s = seats[number];
  if (s.status !== "held") {
    return { ok: false, rule: "not_held", message: "That seat is not on an extendable hold." };
  }
  if (s.extensions >= config.maxExtensions) {
    return { ok: false, rule: "max_extensions", message: "This hold has been extended the maximum number of times." };
  }

  s.extensions = s.extensions + 1;
  s.expiresAt = clock.now() + config.holdExpirySeconds * 1000;
  logEvent("extended", number, email, "extension " + s.extensions);

  return { ok: true, seat: number, expiresAt: s.expiresAt };
}

// Confirm a hold. Idempotent: confirming an already-confirmed seat with the
// same email and code returns success again without changing anything.
function confirmHold(email, holdCode) {
  expireHolds();

  const number = findSeatByCode(email, holdCode);
  if (number === null) {
    return { ok: false, rule: "not_found", message: "No active hold matches that email and code." };
  }
  const s = seats[number];

  // Already confirmed with the same email and code: return success, no change.
  if (s.status === "confirmed") {
    return { ok: true, seat: number, alreadyConfirmed: true };
  }

  s.status = "confirmed";
  s.expiresAt = null; // confirmed seats do not expire
  logEvent("confirmed", number, email, "");

  return { ok: true, seat: number };
}

// Release an active hold or a confirmed seat.
function releaseHold(email, holdCode) {
  expireHolds();

  const number = findSeatByCode(email, holdCode);
  if (number === null) {
    return { ok: false, rule: "not_found", message: "No active hold or confirmed seat matches that email and code." };
  }

  logEvent("released", number, email, "");
  freeSeat(number);
  promoteFromWaitlist(number);

  return { ok: true, seat: number };
}

// Join the waitlist (only when no seats are available).
function joinWaitlist(email) {
  expireHolds();

  // Are there any available seats? If so, you cannot join the waitlist.
  for (const number in seats) {
    if (seats[number].status === "available") {
      return { ok: false, rule: "seats_available", message: "There are still seats available." };
    }
  }
  if (waitlist.includes(email)) {
    return { ok: false, rule: "already_waiting", message: "You are already on the waitlist." };
  }
  if (userHasSeat(email)) {
    return { ok: false, rule: "already_has_seat", message: "You already have a hold or a confirmed seat." };
  }

  waitlist.push(email);
  logEvent("waitlist_joined", null, email, "");

  return { ok: true, position: waitlist.length };
}

// ---- Reading state (for the frontend) ----

function getSeats() {
  expireHolds();
  const list = [];
  for (const number in seats) {
    list.push({
      seat: Number(number),
      status: seats[number].status,
      email: seats[number].email
    });
  }
  return { seats: list, waitlist: waitlist.slice() };
}

function getLog() {
  return eventLog.slice();
}

// Used by tests to reset everything to a clean start.
function reset() {
  for (const key in seats) {
    delete seats[key];
  }
  waitlist = [];
  eventLog.length = 0;
  for (const key in holdHistory) {
    delete holdHistory[key];
  }
  setupSeats();
}

module.exports = {
  holdSeat: holdSeat,
  extendHold: extendHold,
  confirmHold: confirmHold,
  releaseHold: releaseHold,
  joinWaitlist: joinWaitlist,
  getSeats: getSeats,
  getLog: getLog,
  expireHolds: expireHolds,
  reset: reset
};