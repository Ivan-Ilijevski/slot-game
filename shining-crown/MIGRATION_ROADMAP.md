# Migration Roadmap: Refactoring page.tsx to Modular Architecture

**Created:** 2025-10-22
**Last Updated:** 2025-10-22
**Status:** ✅ Phase 1 & 2 Complete (5/7 hooks extracted)
**Goal:** Extract 3,405 lines of monolithic code from `page.tsx` into reusable, modular components

---

## ✅ Completed Extractions

### Phase 1: Foundation (Complete)
- ✅ **src/utils/currency.ts** - Currency formatting utilities
- ✅ **src/config/gameConstants.ts** - Game constants (loads from JSON)
- ✅ **public/assets/gameConfig.json** - Centralized game configuration

### Phase 2: State Management Hooks (5/7 Complete)
- ✅ **src/components/game/useBetManager.ts** - Bet amount selection
- ✅ **src/components/game/useDenominationManager.ts** - Denomination selection (cosmetic)
- ✅ **src/components/game/useWallet.ts** - Balance API and cashout
- ⏳ Keyboard handler (pending)
- ⏳ WebSocket integration (pending)

---

## Current State

### Main Game (`src/app/page.tsx`)
- **Size:** 3,405 lines
- **Architecture:** Monolithic single component
- **Issues:**
  - All game logic inline in one massive useEffect
  - 40+ useRef hooks managing state
  - Duplicated logic that exists in unused components
  - Hard to test, debug, and maintain
  - PIXI initialization mixed with React logic

### Unused Modular Components (Now Flagged with .UNUSED)
- GameRenderer.UNUSED.tsx
- BalanceDisplay.UNUSED.tsx
- BettingControls.UNUSED.tsx
- GambleFeature.UNUSED.tsx
- AutoplayFeature.UNUSED.tsx
- KeyboardHandler.UNUSED.tsx
- PIXIGameCanvas.UNUSED.tsx
- ReelsManager.UNUSED.ts
- PaylineCalculator.UNUSED.ts
- WinAnimations.UNUSED.ts
- SoundManager.UNUSED.ts
- APIClient.UNUSED.ts
- AssetLoader.UNUSED.ts
- GameConfig.UNUSED.ts
- CurrencyUtils.UNUSED.ts
- CashoutButton.UNUSED.tsx

---

## Migration Strategy

We will use a **step-by-step extraction approach**:
1. Create new component/hook
2. Copy relevant code from page.tsx
3. Adapt and clean up the code
4. Test in isolation
5. Integrate back into page.tsx
6. Remove old code from page.tsx
7. Repeat

---

## Phase 1: Foundation Components (Utility Layer)

### ✅ Step 1.1: Currency Utilities
**File:** `src/utils/currency.ts` (new file)
**Extract from:** page.tsx lines 44-89
**Functions to extract:**
- `formatNumberWithSpaces(num: number): string`
- `currencyToCredits(amount: number, denomination: number): number`
- `formatCurrency(amount: number): string` (from config/currency.ts)

**Dependencies:** None
**Estimated effort:** 10 minutes
**Status:** Pending

---

### Step 1.2: Game Constants
**File:** `src/config/gameConstants.ts` (new file)
**Extract from:** page.tsx lines 48-184
**Constants to extract:**
- `DENOMINATION_OPTIONS: number[]`
- `BET_OPTIONS: number[]`
- Default values for bet, denomination, etc.

**Dependencies:** None
**Estimated effort:** 5 minutes
**Status:** Pending

---

## Phase 2: State Management Hooks

### Step 2.1: Betting Hook
**File:** `src/components/game/useBetting.ts` (new file)
**Extract from:** page.tsx lines 250-292
**Functions to extract:**
- `isBetControlsDisabled()`
- `increaseBet()`
- `decreaseBet()`
- `setMaxBet()`
- `cycleBet()`
- `cycleDenomination()`

**State:**
- currentBet
- denomination

**Dependencies:** gameConstants.ts
**Estimated effort:** 30 minutes
**Status:** Pending

---

### Step 2.2: Balance & Win Collection Hook
**File:** `src/components/game/useBalance.ts` (new file)
**Extract from:** page.tsx lines 52-181, 293-481
**Functions to extract:**
- `refreshBalance()`
- `performCashout()`
- `collectWin()`
- `animateWinAmount()`
- `takeWin()`
- `completeAllAnimations()`
- `stopAllSounds()`
- `startAutoCollectTimeout()`

**State:**
- totalBalance
- pendingWin
- animatedWinAmount
- lastWin
- isWinAnimating

**Dependencies:** currency.ts, API routes
**Estimated effort:** 1 hour
**Status:** Pending

---

### Step 2.3: Gamble Feature Hook
**File:** `src/components/game/useGamble.ts` (new file)
**Extract from:** page.tsx lines 517-876
**Functions to extract:**
- `startCardFlashing()`
- `stopCardFlashing()`
- `enterGambleMode()`
- `exitGambleMode()`
- `chooseGambleColor()`
- `collectGambleWin()`
- `updateGambleHistory()`

**State:**
- isGambleMode
- gambleAmount
- gambleStage
- selectedColor
- cardColor
- gambleHistory

**Dependencies:** Sound system, PIXI (for UI)
**Estimated effort:** 1.5 hours
**Status:** Pending

---

## Phase 3: PIXI Rendering Components

### Step 3.1: PIXI Setup & Asset Loading
**File:** `src/components/game/usePixiSetup.ts` (new file)
**Extract from:** page.tsx lines 1026-1316
**Functions to extract:**
- PIXI Application initialization
- Asset loading (atlases, images, sounds)
- Background setup
- Reel container creation
- Mask creation

**Dependencies:** PIXI.js, asset files
**Estimated effort:** 2 hours
**Status:** Pending

---

### Step 3.2: UI Overlay Component
**File:** `src/components/game/GameUIOverlay.tsx` (new file)
**Extract from:** page.tsx lines 1330-1544
**Renders:**
- Balance/Bet/Win displays (PIXI Text elements)
- Denomination display
- Autostart indicator
- Lines indicators
- UI cabinet overlay

**Props:**
- balance, bet, win amounts
- denomination
- language
- isAutoStart

**Dependencies:** PIXI.js, currency utilities
**Estimated effort:** 1 hour
**Status:** Pending

---

### Step 3.3: Reel Rendering Component
**File:** `src/components/game/ReelRenderer.tsx` (new file)
**Extract from:** page.tsx lines 1209-1316, 1705-2108
**Functions:**
- Create reel symbols
- Animate reel spinning
- Handle stop requests
- Bounce animation

**Dependencies:** PIXI.js, asset atlases
**Estimated effort:** 3 hours
**Status:** Pending

---

### Step 3.4: Win Animations Component
**File:** `src/components/game/WinAnimationsRenderer.tsx` (new file)
**Extract from:** page.tsx lines 2207-2914
**Functions:**
- `animateWinningSymbols()` - 57-frame symbol animations
- `showWinHighlights()` - Payline highlights
- `showWinHighlightsAfterAnimation()` - Cycle through wins
- `showWinLineDisplay()` - Win line info display
- Payline path drawing

**Dependencies:** PIXI.js, win system utilities
**Estimated effort:** 3 hours
**Status:** Pending

---

### Step 3.5: Wild Expansion Component
**File:** `src/components/game/WildExpansionRenderer.tsx` (new file)
**Extract from:** page.tsx lines 2111-2357
**Functions:**
- `checkAndAnimateWilds()` - Trigger wild expansion
- `animateExpandingWild()` - 69-frame expansion animation
- `completeWildExpansions()` - Instant completion for take win

**Dependencies:** PIXI.js, sound system
**Estimated effort:** 2 hours
**Status:** Pending

---

### Step 3.6: Gamble UI Component
**File:** `src/components/game/GambleUIRenderer.tsx` (new file)
**Extract from:** page.tsx lines 1593-1703
**Renders:**
- Gamble container
- Face-down/face-up cards
- Red/Black buttons
- Collect button
- Gamble amount text
- Instructions text
- History display

**Dependencies:** PIXI.js, useGamble hook
**Estimated effort:** 2 hours
**Status:** Pending

---

## Phase 4: Game Logic Integration

### Step 4.1: Spin Logic Hook
**File:** `src/components/game/useSpinLogic.ts` (new file)
**Extract from:** page.tsx lines 1705-2108
**Functions:**
- `spinReels()` - Main spin function (~400 lines)
- Balance validation
- API call to /api/spin
- Reel animation coordination
- Stop request handling
- Wild expansion triggering
- Win display triggering

**Dependencies:**
- useBalance hook
- API client
- Reel renderer
- Win animations
- Sound system

**Estimated effort:** 4 hours
**Status:** Pending

---

### Step 4.2: Keyboard Handler Hook
**File:** `src/components/game/useKeyboard.ts` (new file)
**Extract from:** page.tsx lines 924-981, 1546-1591
**Functions:**
- Keyboard event listener
- Key mapping to actions (Space, R, B, D, L, P)
- Context-aware key handling (gamble vs normal mode)

**Dependencies:** All game hooks (betting, gamble, spin, etc.)
**Estimated effort:** 1 hour
**Status:** Pending

---

## Phase 5: External Integrations

### Step 5.1: WebSocket Integration Hook
**File:** `src/components/game/useWebSocket.ts` (new file)
**Extract from:** page.tsx lines 3018-3278
**Functions:**
- WebSocket client initialization
- Command handling (set-bet, gamble actions, cashout, etc.)
- Game state broadcasting
- Connection management

**Dependencies:** websocketClient library, all game state
**Estimated effort:** 2 hours
**Status:** Pending

---

### Step 5.2: Voucher System Integration
**File:** Already exists as separate components
**Components:**
- VoucherInput.tsx ✅
- VoucherPrintingScreen.tsx ✅
- MessagePopup.tsx ✅

**Extract from:** page.tsx lines 76-181
**Handlers:**
- `handleVoucherValidated()`
- `handleVoucherError()`
- `handlePrintingComplete()`
- `handlePrintingError()`
- `showMessage()`

**Status:** Partially complete (components exist, handlers need extraction)

---

## Phase 6: Main Game Component Refactoring

### Step 6.1: Create New Modular Game Component
**File:** `src/components/game/SlotGame.tsx` (new file)
**Purpose:** Orchestrate all hooks and components
**Uses:**
- useBetting
- useBalance
- useGamble
- useSpinLogic
- useKeyboard
- useWebSocket
- usePixiSetup
- All renderer components

**Estimated effort:** 3 hours
**Status:** Pending

---

### Step 6.2: Replace page.tsx
**File:** `src/app/page.tsx`
**Action:** Replace entire content with:
```tsx
'use client'
import SlotGame from '../components/game/SlotGame'

export default function Home() {
  return <SlotGame />
}
```

**Estimated effort:** 5 minutes
**Status:** Pending

---

## Phase 7: Testing & Validation

### Step 7.1: Component Testing
- Test each hook in isolation
- Verify PIXI rendering
- Test keyboard handlers
- Test WebSocket communication

**Estimated effort:** 4 hours
**Status:** Pending

---

### Step 7.2: Integration Testing
- Full game flow testing
- Gamble feature testing
- Win animations testing
- Cashout testing
- Voucher system testing

**Estimated effort:** 3 hours
**Status:** Pending

---

### Step 7.3: Cleanup
- Remove unused .UNUSED files (or keep for reference)
- Update documentation
- Add JSDoc comments
- Clean up console.logs

**Estimated effort:** 2 hours
**Status:** Pending

---

## Total Estimated Effort

| Phase | Effort |
|-------|--------|
| Phase 1: Foundation | 15 minutes |
| Phase 2: State Hooks | 3 hours |
| Phase 3: PIXI Rendering | 13 hours |
| Phase 4: Game Logic | 5 hours |
| Phase 5: Integrations | 2 hours |
| Phase 6: Main Component | 3 hours |
| Phase 7: Testing | 9 hours |
| **TOTAL** | **~35 hours** |

---

## Order of Execution

1. ✅ Flag unused files with .UNUSED
2. Foundation utilities (currency, constants)
3. State management hooks (betting, balance, gamble)
4. PIXI setup and asset loading
5. UI rendering components (overlay, reels, win animations)
6. Game logic integration (spin, keyboard)
7. External integrations (WebSocket, voucher)
8. Main game component orchestration
9. Replace page.tsx
10. Testing and validation
11. Cleanup and documentation

---

## Benefits After Migration

- ✅ **Testability:** Each component can be tested in isolation
- ✅ **Maintainability:** Clear separation of concerns
- ✅ **Reusability:** Components can be used in other games
- ✅ **Readability:** 3,405 lines → ~10-20 modular files
- ✅ **Performance:** Easier to optimize individual pieces
- ✅ **Developer Experience:** Easier to onboard new developers
- ✅ **Debugging:** Clear error boundaries and logging

---

## Next Steps

Start with **Phase 1.1: Currency Utilities** - the simplest extraction with no dependencies.

Ready to begin? (Y/N)
