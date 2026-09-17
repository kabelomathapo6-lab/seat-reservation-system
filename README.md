# Seat Reservation System

A small event seat booking system built with Node.js and Express for the Melsoft
technical assessment. An event has a fixed number of seats. A user can hold a
seat, then confirm it before the hold expires. If the event is full, a user can
join a waitlist and is given a seat automatically when one frees up.

## What it does

- Shows a seat map where you enter an email and hold an available seat.
- A hold gives you a 6 character hold code (uppercase letters and digits, never
  the confusing characters 0, O, 1, I or L).
- You can extend, confirm, or release a hold using your email and hold code.
- Holds expire after 60 seconds and the seat becomes available again.
- When the event is full you can join a waitlist, and you are automatically given
  a seat (with a new hold) when one becomes free.
- Every change is written to an append-only event log you can view.

## How to run it

1. Install Node.js (version 20 or newer).
2. In the project folder, install the one dependency:

   ```
   npm install
   ```

3. Start the server:

   ```
   node server.js
   ```

4. The server runs on http://localhost:3000. Open these pages in a browser:
   - Seat map: http://localhost:3000/index.html
   - Manage a hold: http://localhost:3000/manage.html
   - Event log: http://localhost:3000/log.html

"Notifications" (for waitlist promotion) are printed to the server console.

## How to run the tests

The tests use Node's built-in test runner. Run:

```
npm test
```

They cover the main rules: hold code format and uniqueness, expiry, the
per-user concurrent-hold limit, idempotent confirmation, and waitlist promotion.
The tests use a fake clock (see `clock.js`) so time-based rules like expiry are
tested instantly, without waiting the real 60 seconds.

## Configuration

All the settings are in `config.js` so they are easy to change:

| Setting | Default | Meaning |
|---------|---------|---------|
| totalSeats | 20 | how many seats the event has |
| holdExpirySeconds | 60 | how long a hold lasts before it expires |
| maxConcurrentHolds | 2 | most active (unconfirmed) holds one user can have at once |
| maxHoldsPerHour | 5 | most holds one user can place in an hour |
| maxExtensions | 2 | most times a single hold can be extended |
| holdCodeLength | 6 | how many characters a hold code has |

Change a value in `config.js` and restart the server.

## Project files

```
config.js               the settings
clock.js                a small time helper (makes time-based rules testable)
seatStore.js            all the rules, the seat state, the waitlist, the event log
server.js               the Express API (routes just call seatStore)
test/
  seatStore.test.js     the automated tests
public/
  index.html            the seat map screen
  manage.html           the manage-hold screen (extend, confirm, release)
  log.html              the event log screen
```

## API routes

All rejections return HTTP 409 with `{ ok: false, rule, message }` so the client
knows which rule was violated. Missing input returns HTTP 400.

- `POST /hold` with `{ email, seat }` places a hold.
- `POST /extend` with `{ email, holdCode }` extends a hold.
- `POST /confirm` with `{ email, holdCode }` confirms a hold (idempotent).
- `POST /release` with `{ email, holdCode }` releases a hold or confirmed seat.
- `POST /waitlist` with `{ email }` joins the waitlist (only when full).
- `GET /seats` returns the seat map and waitlist.
- `GET /log` returns the event log.

## Design notes

- **Rules are separate from the server.** All the business rules live in
  `seatStore.js`. The server (`server.js`) only reads the request, calls one
  store function, and returns the result. This keeps the rules in one place.
- **Swapping in a database later.** The state (seats, waitlist, event log) is
  kept in variables at the top of `seatStore.js`, and every rule reads and writes
  through small helper functions. To use a database instead, you would change
  only those reads and writes to talk to the database. The rules themselves would
  not change, because they do not know or care where the data is stored.
- **Concurrency.** Node runs JavaScript on a single thread, and each action in
  `seatStore.js` is one synchronous function with no waiting in the middle. That
  means two requests cannot interleave and both grab the same seat. One finishes
  fully before the next starts.
- **Time is testable.** Everything that needs the current time calls
  `clock.now()` instead of `Date.now()`. In tests we replace the clock with a
  fake one we can move forward, so expiry and limits are tested instantly.
- **Expiry.** A timer runs every 2 seconds to free expired holds and promote the
  waitlist. Each action also frees expired holds first, so an expired hold is
  never treated as valid.
- **Event log.** Every change is appended to a log with a timestamp, so the state
  of any seat can be traced from the log alone.
```
