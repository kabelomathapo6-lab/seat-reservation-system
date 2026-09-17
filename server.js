// server.js
// The API. Each route reads the request, calls a function in seatStore.js,
// and returns the result. The business rules live in seatStore, not here.
// A timer runs expireHolds() every couple of seconds so expired holds are
// freed and the waitlist is promoted.

const express = require("express");
const path = require("path");
const store = require("./seatStore");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Helper: send a rejection with the rule that was violated.
// We use 409 (conflict) for rule violations and 400 for missing input.
function rejected(res, result) {
  res.status(409).json({ ok: false, rule: result.rule, message: result.message });
}

// POST /hold  { email, seat }
app.post("/hold", function (req, res) {
  const email = req.body.email;
  const seat = Number(req.body.seat);
  if (!email || !seat) {
    return res.status(400).json({ ok: false, message: "Email and seat are required." });
  }
  const result = store.holdSeat(email, seat);
  if (!result.ok) {
    return rejected(res, result);
  }
  res.json(result);
});

// POST /extend  { email, holdCode }
app.post("/extend", function (req, res) {
  const email = req.body.email;
  const holdCode = req.body.holdCode;
  if (!email || !holdCode) {
    return res.status(400).json({ ok: false, message: "Email and hold code are required." });
  }
  const result = store.extendHold(email, holdCode);
  if (!result.ok) {
    return rejected(res, result);
  }
  res.json(result);
});

// POST /confirm  { email, holdCode }
app.post("/confirm", function (req, res) {
  const email = req.body.email;
  const holdCode = req.body.holdCode;
  if (!email || !holdCode) {
    return res.status(400).json({ ok: false, message: "Email and hold code are required." });
  }
  const result = store.confirmHold(email, holdCode);
  if (!result.ok) {
    return rejected(res, result);
  }
  res.json(result);
});

// POST /release  { email, holdCode }
app.post("/release", function (req, res) {
  const email = req.body.email;
  const holdCode = req.body.holdCode;
  if (!email || !holdCode) {
    return res.status(400).json({ ok: false, message: "Email and hold code are required." });
  }
  const result = store.releaseHold(email, holdCode);
  if (!result.ok) {
    return rejected(res, result);
  }
  res.json(result);
});

// POST /waitlist  { email }
app.post("/waitlist", function (req, res) {
  const email = req.body.email;
  if (!email) {
    return res.status(400).json({ ok: false, message: "Email is required." });
  }
  const result = store.joinWaitlist(email);
  if (!result.ok) {
    return rejected(res, result);
  }
  res.json(result);
});

// GET /seats  -> the seat map and the waitlist (for the frontend to poll)
app.get("/seats", function (req, res) {
  res.json(store.getSeats());
});

// GET /log  -> the full event log
app.get("/log", function (req, res) {
  res.json(store.getLog());
});

// Run the expiry check every 2 seconds.
setInterval(function () {
  store.expireHolds();
}, 2000);

app.listen(PORT, function () {
  console.log("Seat reservation server running on http://localhost:" + PORT);
});