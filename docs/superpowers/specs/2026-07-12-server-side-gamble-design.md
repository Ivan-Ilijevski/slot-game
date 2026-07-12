# Server-Side Gamble (Double-or-Nothing) — Design

**Date:** 2026-07-12
**Status:** Approved
**Scope:** `shining-crown/` app only

## Problem

The gamble feature's outcome is decided client-side: `chooseGambleColor` in
`src/app/page.tsx` draws the card with `Math.random()`, and on exit the client
POSTs a self-computed net result to `/api/gamble`, which trusts the claimed
`type` and `amount` and applies them to the wallet. Anyone with DevTools can
report arbitrary gamble wins. The spin flow is already server-authoritative
(crypto RNG, server-side payout, wallet credited at spin time); gamble is the
remaining client-trusted money path.

## Goals

- The server draws the card, tracks the gamble session, and settles the wallet.
  The client only renders what the server returns.
- Enforce a cap of **5 successful doublings** per session (force-collect on the
  5th win), matching real EGT cabinet behavior.
- Keep the player-visible UX identical: same animations, sounds, card history,
  tablet remote-control flow, and timing.
- Unit-test the new server logic (first test infrastructure in the repo:
  vitest).

## Non-goals

- Half-gamble ("gamble half") — not in the current game.
- Multi-user / multi-session support — this is a single-player kiosk.
- Changing how spin wins are credited (win is added to wallet at spin time;
  that stays).
- The PIXI React migration or any rendering changes.

## Architecture

### New module: `src/lib/gambleSession.ts` (server-only)

Owns all gamble state and money movement. State persists in
`src/data/gambleState.json` (same pattern as `wallet.json`) so it survives
Next.js dev-mode module reloads and process restarts. The file is created with
a default empty state when missing (like `readWallet`) and is **gitignored**
(`/src/data/gambleState.json` in `shining-crown/.gitignore`) — unlike
`wallet.json` it has no history value.

```ts
interface GambleState {
  // Set by the spin route after a winning spin; consumed by startGamble.
  eligibleWin: { amount: number; spinId: string; createdAt: string } | null
  // Active double-or-nothing session, if any.
  session: {
    stake: number          // initial staked win (MKD), already in the wallet
    currentAmount: number  // doubles on each win; 0 never occurs (loss closes)
    round: number          // completed successful doublings (0..5)
    history: { round: number; choice: Color; drawn: Color; won: boolean; at: string }[]
    startedAt: string
  } | null
}
type Color = 'red' | 'black'
```

All amounts are in wallet currency units (MKD) — the same amount the spin
route credited via `addBalance`.

Exported operations (each validates state, mutates, persists, returns a result
object; **mutating operations are serialized through an internal promise queue**
so concurrent requests cannot double-settle):

- `setEligibleWin(amount, spinId)` — called by the spin route on a winning
  spin. Overwrites any previous value. `clearEligibleWin()` on zero-win spins.
- `startGamble()` — requires `eligibleWin` and no active session. Consumes
  `eligibleWin`, creates `session` with `stake = currentAmount = amount`,
  `round = 0`.
- `chooseColor(choice: Color)` — requires an active session. Draws with the
  crypto-secure RNG (`secureRandom(0, 1)`), `won = choice === drawn`.
  - **Win:** `currentAmount *= 2`, `round += 1`. If `round === 5`, settle as
    collect (below) and close the session; response carries
    `forceCollected: true`.
  - **Loss:** immediately `deductBalance(stake, 'gamble_loss', metadata)`
    (the stake was credited at spin time) and close the session.
- `collect()` — settles an active session: if `currentAmount > stake`,
  `addBalance(currentAmount - stake, 'gamble_win', metadata)`; if
  `currentAmount === stake` (no rounds played), no transaction. Closes the
  session. **Idempotent:** with no active session it returns
  `{ settled: false, balance }` successfully — this keeps the client's shared
  exit path simple (the post-loss exit also calls it).
- `getState()` — read-only snapshot for the GET endpoint and guards:
  `{ sessionActive, currentAmount?, round?, eligibleWin? }`.
- `isSessionActive()` — cheap guard helper for spin/cashout routes.

Settlement transaction metadata: `{ initialAmount, finalAmount, netAmount,
rounds, forceCollected?, description }` — same fields the current client sends,
now computed server-side.

### Shared RNG util: `src/utils/secureRandom.ts`

The existing `secureRandom(min, max)` (rejection-sampled `crypto.randomBytes`)
moves out of `src/app/api/spin/route.ts` into this util; the spin route and
`gambleSession.ts` both import it. No behavior change.

### API: `/api/gamble` (rewritten)

`POST` body `{ action: 'start' | 'choose' | 'collect', color?: Color }`:

- `start` → `{ success, amount, toWin }` — 409 if no eligible win or a session
  is already active.
- `choose` → `{ success, won, card: { color, cardIndex }, currentAmount,
  round, forceCollected?, balance? }` — 409 if no active session; 400 on bad
  `color`. `balance` is included whenever the wallet changed (loss,
  force-collect). `cardIndex` is 0 or 1 (drawn server-side) and the client maps
  it to its card textures — no asset filenames on the server.
- `collect` → `{ success, settled, netAmount?, balance }`.

`GET` → `getState()` snapshot. Used by the client on mount for crash/reload
recovery (below).

Errors: `{ success: false, error }` with 400 (malformed input), 409 (wrong
state for the action), 500 (unexpected).

### Spin route changes (`/api/spin`)

- Reject with 409 `"Gamble in progress"` when `isSessionActive()`.
- After computing the spin result: winning spin →
  `setEligibleWin(winAmount, spinId)`; zero-win spin → `clearEligibleWin()`.
  The route has no spin identifier today; it generates one with
  `crypto.randomUUID()` when recording eligibility (audit provenance only).

### Cashout guard (`/api/cashout`)

Reject with 409 when `isSessionActive()` — prevents cashing out the wallet
while its staked win is on the table (double-spend).

### Client changes (`src/app/page.tsx`)

Minimal, behavior-preserving:

- `enterGambleMode()` — POST `start`; enter the gamble UI only on success.
- `chooseGambleColor(color)` — becomes async. Replaces the `Math.random()`
  draw with POST `choose`; renders the returned card via the existing texture
  map (`red: [cardFront1, cardFront2]`, `black: [cardFront0, cardFront3]`,
  indexed by `cardIndex`). Win/loss branches drive the exact same UI, sounds,
  and timeouts as today. On `forceCollected`, the 2-second win display is
  followed by exit instead of the next round. The reveal already sits behind a
  card-flash delay, so the localhost fetch latency is invisible.
- `exitGambleMode()` — the self-computed net `/api/gamble` POST is replaced by
  `collect`; wallet refresh uses the returned balance. After a loss the server
  has already settled, so `collect` is a no-op that still returns the balance.
- **Reload recovery:** on mount, GET `/api/gamble`; if a session is active
  (page was reloaded mid-gamble), POST `collect` and refresh the balance —
  the player keeps the current amount, and the spin guard can't wedge the game.
- The tablet path needs no changes: remote-control routes relay commands to
  the main client, which now calls the new API.

## Testing

- **vitest** (new dev dependency), `"test": "vitest run"` script, node
  environment, tests in `src/**/*.test.ts`.
- `src/lib/gambleSession.test.ts` covers: start requires eligibility; start
  consumes eligibility; win doubles and increments round; loss deducts stake
  and closes session; collect pays net and closes; collect with no rounds moves
  no money; collect is idempotent; 5th win force-collects with correct payout;
  eligibility is overwritten by a new spin win and cleared by a losing spin;
  spin/cashout guard helper reflects session state.
- Tests run against a temp directory: both `wallet.ts` and `gambleSession.ts`
  resolve paths from `process.cwd()`, so tests `process.chdir()` into a tmp
  fixture dir (fresh `src/data/` per test).
- Card-draw distribution is not statistically tested; `secureRandom` is
  exercised for range only (it's the same helper the spin already uses).

## Manual verification

Play the flow end-to-end in the running app: win → gamble → correct/incorrect
guesses → collect; confirm `transactions.json` entries and `wallet.json`
balance match; confirm the tablet gamble buttons still work; confirm a page
reload mid-gamble recovers the amount.

## Risks / notes

- `page.tsx` is a 3,161-line component; the client edits touch three
  callbacks. Keep the diffs surgical — no refactoring of surrounding code in
  this change.
- After this change the client's `pendingWin` is display state only; the
  server is the source of truth for money. Client/server disagreement resolves
  in the server's favor by construction.
- `gambleState.json` sits next to the other runtime JSON in `src/data/`;
  moving that directory out of `src/` (and out of git) is a known, separate
  cleanup — out of scope here.
