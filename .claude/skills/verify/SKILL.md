---
name: verify
description: Build/launch/drive recipe for verifying changes to the Shining Crown slot game (Next.js + PIXI, custom server on port 3000)
---

# Verifying Shining Crown changes

## Launch

```bash
cd shining-crown && npm run dev   # node server.js — Next.js + WebSocket relay on :3000
curl -s http://localhost:3000/api/wallet   # ready when this returns 200 (~3s)
```

**Check `lsof -nP -iTCP:3000 -sTCP:LISTEN` first.** The user often has the
game open on this port and may be actively playing — do not kill an already
running server, and if you started it, warn before stopping it.

## Drive the API surface

```bash
curl -X POST localhost:3000/api/spin -H 'Content-Type: application/json' -d '{"betAmount":5}'
curl localhost:3000/api/gamble                      # {sessionActive, currentAmount?, round?, eligibleWin?}
curl -X POST localhost:3000/api/gamble -d '{"action":"start"}'    # then "choose" (+color), "collect"
curl localhost:3000/api/wallet
```

Win frequency is roughly 1 in 10 spins; loop spins and watch `totalWin` (or
`eligibleWin` on GET /api/gamble) to reach a winnable state.

## Drive the GUI surface

Playwright against `http://localhost:3000`. The game is a PIXI canvas driven
by keyboard — synthetic events work because handlers match `event.code` only:

```js
window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))
```

Bindings (from `public/assets/gameConfig.json`): Space = spin / collect,
R/B = enter gamble + choose red/black, D = denomination, L = language.
Each spin animation takes ~3s; wait before the next press.

## Gotchas

- Console error `WebSocket ... webpack-hmr ... 400` is pre-existing noise
  (custom `ws` server clashes with Next dev HMR socket) — not a finding.
- Dev-mode recompiles can destroy Playwright `evaluate` contexts mid-run;
  keep in-page loops short and retry.
- Runtime state lives in `src/data/` (`wallet.json`, `transactions.json`,
  `gambleState.json`) — spins and gambles mutate the first two, which are
  git-tracked; expect churn in `git status` after driving the app.
- Balance math for checks: spin win is credited at spin time; gamble loss
  deducts the stake; gamble collect adds only the net.
