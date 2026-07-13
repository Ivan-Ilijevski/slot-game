# Shining Crown — Architecture

A 5×3, 10-payline slot game (EGT Shining Crown style) built as a kiosk
terminal: Next.js 15 App Router, React 19, PIXI.js 8 + @pixi/react 8,
TypeScript. Runs through a custom [server.js](server.js) (Next + a `ws`
WebSocket relay on `/ws` for the tablet remote control), MKD wallet,
thermal-printer vouchers, EN/MK UI.

## Rendering: hybrid declarative/imperative

The scene is declared once; animations mutate it imperatively at 60fps.

```
page.tsx  ──────────────  owns state, hooks, and all game flow
   │  props + refs
   ▼
PixiGameIntegration.tsx ─  copies the PixiGame handle into legacy refs
   ▼
PixiGame.tsx ───────────  <Application> + render-once scene (memo)
                          stage carries the responsive scale;
                          scene elements are direct stage children
```

- **[src/components/game/PixiGame.tsx](src/components/game/PixiGame.tsx)** —
  loads assets, renders the scene exactly once (background, reels, labeled
  `winLineDisplay` container, lines indicators, cabinet overlay, border, UI
  texts, bet arrows, AUTO indicator), then exposes a handle:
  `getApp / getReels / getReelsContainer / getTextRefs / getUiCabinetOverlay`.
  Each reel's children follow the contract the animation hooks rely on:
  **`[mask @0, overshoot sprite @1, symbols @2–4]`**. Resize = imperative
  `renderer.resize` + `stage.scale.set` together.
- **[src/components/game/PixiGameIntegration.tsx](src/components/game/PixiGameIntegration.tsx)** —
  populates `page.tsx`'s refs (app, reels, text elements, overlay sprite) and
  fires `onReady(app)`, where the page mounts the gamble UI.
- After mount, **React never reconciles the scene**. All dynamic content is
  driven through refs: text updates via effects in `page.tsx`, overlay
  texture swap on language change, spin/win/gamble mutations via the hooks.

## Game logic hooks (imperative)

- **[useSpinLogic](src/components/game/useSpinLogic.ts)** — the full spin
  cycle: POST `/api/spin { bet }`, frame-timed reel animation on the PIXI
  ticker (bounce tables, overshoot, slam-stop), applies server symbols,
  sequences wild expansion + win highlights, autostart re-trigger.
- **[useWinAnimations](src/components/game/useWinAnimations.ts)** — payline
  highlight graphics (inserted above the reel border, below overlays),
  win-line text in the labeled `winLineDisplay` container, 57-frame symbol
  win animations, 69-frame expanding wilds with take-win cancellation,
  win-sound sequencing.
- **[useGameControlKeys](src/components/game/useGameControlKeys.ts)** — Space
  (spin / slam-stop / take-win) and P (autostart);
  **[useKeyboardHandler](src/components/game/useKeyboardHandler.ts)** — R/B/D/L
  and gamble keys (bindings in `public/assets/gameConfig.json`).
- **[gambleUI.ts](src/components/game/gambleUI.ts)** — builds the gamble
  overlay imperatively onto the stage; the gamble flow in `page.tsx` mutates
  its `gambleElements` bag.
- Shared: [src/config/pixiConstants.ts](src/config/pixiConstants.ts) (scene
  geometry, paylines, symbol map — import-safe on the server) and
  [src/utils/gameSounds.ts](src/utils/gameSounds.ts) (lazy `@pixi/sound`
  singleton + reel/wild sound effects).

## Server-authoritative money

The client renders; the server decides. All state lives in `src/data/`.

- **Spin** — [/api/spin](src/app/api/spin/route.ts): crypto-secure RNG
  ([secureRandom](src/utils/secureRandom.ts)) over virtual reel strips,
  payline evaluation, wild expansion; deducts the bet and credits wins to
  [wallet.json](src/data/wallet.json) immediately; records gamble
  eligibility; rejects while a gamble session is open.
- **Gamble** — [/api/gamble](src/app/api/gamble/route.ts) +
  [gambleSession.ts](src/lib/gambleSession.ts): file-backed session
  (`gambleState.json`, gitignored), `start`/`choose`/`collect` state machine,
  server-drawn card, loss deducts the stake instantly, 5th doubling
  force-collects, idempotent collect; the client auto-collects abandoned
  sessions on page load. Cashout is blocked mid-session.
- Every wallet movement is journaled to
  [transactions.json](src/data/transactions.json)
  ([transactionLogger](src/utils/transactionLogger.ts)).

## Peripherals

- **Tablet remote** — `server.js` relays `tablet-command` WebSocket messages
  to the main game client, which executes them through the same function refs
  the keyboard uses ([useTouchKeyboardConnection](src/components/game/useTouchKeyboardConnection.ts),
  `/api/remote-control/*`, [/keyboard](src/app/keyboard/page.tsx) page).
- **Vouchers / printer** — voucher generate/validate proxy to
  `VOUCHER_SERVER_URL` (see `.env.local`); thermal receipt printing via
  `node-thermal-printer`/`serialport`/`usb` ([src/utils/thermalPrinter.ts](src/utils/thermalPrinter.ts)).

## Testing

`npm test` (vitest) covers the server gamble session and RNG helper. For
end-to-end verification recipes (API drive + Playwright keyboard drive), see
[.claude/skills/verify/SKILL.md](../.claude/skills/verify/SKILL.md).
