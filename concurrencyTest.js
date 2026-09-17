// concurrencyTest.js
// A small script to show the concurrency rule working: two users cannot both
// hold the same seat. It fires several hold requests at the SAME seat at the
// same time, then prints how many succeeded. The correct result is exactly 1.
//
// How to use:
//   1. Start the server in one terminal:  node server.js
//   2. In another terminal, run:          node concurrencyTest.js
//
// Change SEAT below if seat 1 is already taken (pick an available one).

const SEAT = 1;
const HOW_MANY = 5; // how many people try for the same seat at once

async function tryHold(personNumber) {
  const res = await fetch("http://localhost:3000/hold", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "person" + personNumber + "@test.com",
      seat: SEAT
    })
  });
  const data = await res.json();
  return data;
}

async function run() {
  // Build the list of attempts and fire them all at the same time.
  const attempts = [];
  for (let i = 1; i <= HOW_MANY; i++) {
    attempts.push(tryHold(i));
  }
  const results = await Promise.all(attempts);

  let successes = 0;
  results.forEach(function (r, index) {
    if (r.ok) {
      successes++;
      console.log("Person " + (index + 1) + ": GOT the seat (code " + r.holdCode + ")");
    } else {
      console.log("Person " + (index + 1) + ": rejected (" + r.rule + ")");
    }
  });

  console.log("");
  console.log("Total people who tried: " + HOW_MANY);
  console.log("Total who got seat " + SEAT + ": " + successes);
  console.log(successes === 1 ? "CORRECT: only one person got the seat." : "PROBLEM: more than one succeeded.");
}

run();