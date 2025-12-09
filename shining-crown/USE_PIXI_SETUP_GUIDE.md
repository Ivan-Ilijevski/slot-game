# usePixiSetup Hook - Integration Guide

**Created:** 2025-12-09
**Status:** ✅ Complete - Ready for Integration
**Phase:** 3.1 - PIXI Setup & Asset Loading

---

## Overview

The `usePixiSetup` hook has been extracted from `page.tsx` to handle all PIXI.js initialization, asset loading, and scene setup in a modular, reusable way.

## What Was Extracted

### From page.tsx (lines 971-1495)
- **PIXI Application initialization** (~75 lines)
- **Asset loading** (atlases, images, sounds) (~100 lines)
- **Sound setup functions** (~50 lines)
- **Background creation** (~20 lines)
- **Reel containers setup** (~95 lines)
- **UI text elements** (~165 lines)
- **Overlays and decorations** (~90 lines)

**Total extracted:** ~595 lines from page.tsx

---

## File Location

```
shining-crown/src/components/game/usePixiSetup.ts
```

---

## Exported Constants

The hook exports the following constants that other parts of the code will need:

```typescript
// Layout constants
export const DESIGN_WIDTH = 1920
export const DESIGN_HEIGHT = 1080
export const SYMBOL_WIDTH = 260
export const SYMBOL_HEIGHT = 260
export const REEL_COUNT = 5
export const SYMBOLS_PER_REEL = 3
export const REEL_GAP = 28
export const REEL_OFFSET_X = 422
export const REEL_OFFSET_Y = 140

// Game configuration
export const PAYLINE_COLORS = [...]
export const PAYLINES_VISUAL = [...]
export const SYMBOL_NAME_TO_NUMBER = {...}
```

---

## Usage Example

### In page.tsx

```typescript
import { usePixiSetup } from '@/components/game/usePixiSetup'

function SlotGame() {
  const pixiContainer = useRef<HTMLDivElement>(null)
  const [currentLanguage, setCurrentLanguage] = useState<'en' | 'mk'>('en')

  // Use bet manager and wallet hooks
  const betManager = useBetManager({ ... })
  const denomManager = useDenominationManager({ ... })
  const wallet = useWallet({ ... })

  // Initialize PIXI
  const pixi = usePixiSetup({
    pixiContainer,
    currentLanguage,
    denomination: denomManager.denomination,
    totalBalance: wallet.balance,
    currentBet: betManager.currentBet,
    lastWin: 0,
    onIncreaseBet: betManager.increaseBet,
    onDecreaseBet: betManager.decreaseBet,
    onSpinReels: () => { /* your spin logic */ }
  })

  // Access PIXI refs
  const app = pixi.app.current
  const reels = pixi.reels.current
  const assets = pixi.assets.current

  // Update UI text when values change
  useEffect(() => {
    if (pixi.creditDollarText.current) {
      pixi.creditDollarText.current.text = formatCurrency(wallet.balance)
    }
    if (pixi.betDollarText.current) {
      pixi.betDollarText.current.text = formatCurrency(betManager.currentBet)
    }
  }, [wallet.balance, betManager.currentBet, pixi])

  return (
    <div ref={pixiContainer} />
  )
}
```

---

## Returned Refs

The hook returns the following refs for use in the rest of the application:

### Core PIXI Objects
- `app` - The PIXI Application instance
- `reelsContainer` - Container holding all reel containers
- `reels` - Array of individual reel containers
- `uiCabinetOverlay` - The UI overlay sprite (language-dependent)
- `assets` - All loaded PIXI assets (atlases, textures)

### UI Text Elements
- `creditDollarText` - Credit display ($)
- `creditAmountText` - Credit display (credits)
- `betDollarText` - Bet display ($)
- `betAmountText` - Bet display (credits)
- `winDollarText` - Win display ($)
- `winAmountText` - Win display (credits)
- `denomText` - Denomination number
- `denomLabelText` - Denomination label
- `autoStartText` - Auto-start indicator

### Sound Functions
- `playReelStopSound` - Function to play reel stop sound

---

## Assets Included

The hook loads and provides access to:

### Atlases
- `mainAtlas` - Main UI resources
- `reelAtlas` - Reel symbol images
- `backgroundAtlas` - Background images
- `expandAtlas` - Wild expansion animation
- `wildAtlas` - Wild symbol animation
- `winAtlases` - Win animations for all symbols (00-10)

### Sounds
- `reelSound` - Reel spinning sounds
- `winSound` - Win celebration sounds
- `shortSound` - Short sound effects

---

## Benefits

### 1. **Modularity**
- PIXI setup is now isolated and reusable
- Can be easily tested in isolation
- Clear separation of concerns

### 2. **Reusability**
- Can be used in different game modes
- Easy to create variants (different layouts, languages)

### 3. **Maintainability**
- All PIXI constants in one place
- Easy to modify layout without touching game logic
- Self-documenting with TypeScript types

### 4. **Type Safety**
- Full TypeScript support
- Clear interfaces for props and return values
- Prevents common errors

---

## Next Steps for Integration

1. **Import the hook in page.tsx**
   ```typescript
   import { usePixiSetup, SYMBOL_NAME_TO_NUMBER, PAYLINE_COLORS } from '@/components/game/usePixiSetup'
   ```

2. **Remove old PIXI initialization code** (lines 971-1495 in page.tsx)

3. **Use the hook's returned refs** instead of local refs

4. **Update keyboard handlers** to use pixi.app.current

5. **Update spin logic** to use pixi.reels.current and pixi.assets.current

6. **Test thoroughly** to ensure rendering works correctly

---

## Potential Issues

### Issue 1: Dependency Array
The hook uses an empty dependency array `[]` for the useEffect, meaning PIXI initializes only once. If you need to reinitialize PIXI when language changes, you'll need to modify the hook.

**Solution:** Add language to dependencies or create a separate effect for language changes.

### Issue 2: Text Updates
The hook creates text elements but doesn't update them automatically when props change. You need to update text refs manually in page.tsx.

**Solution:** Create a separate `useEffect` in page.tsx to update text when values change (see usage example above).

### Issue 3: Keyboard Events
The hook doesn't set up keyboard event listeners. This is intentional - keyboard handling is done via the `useKeyboardHandler` hook.

---

## Code Metrics

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| page.tsx lines | 3,265 | ~2,670 | -595 lines |
| Functions in page.tsx | 54 | ~48 | -6 functions |
| PIXI setup complexity | High | Low | Isolated |
| Testability | Hard | Easy | Can test hook independently |

---

## Testing Checklist

Before deploying, verify:

- [ ] PIXI application renders correctly
- [ ] All assets load without errors
- [ ] Reels display initial symbols
- [ ] UI text displays correct values
- [ ] Background and overlays appear
- [ ] Canvas scales properly on resize
- [ ] Language-specific overlay loads
- [ ] Sounds are available
- [ ] No console errors during initialization

---

## Files Modified

- ✅ **Created:** `src/components/game/usePixiSetup.ts` (715 lines)
- ⏳ **To modify:** `src/app/page.tsx` (remove ~595 lines, add hook usage)

---

## Related Documentation

- [MIGRATION_ROADMAP.md](./MIGRATION_ROADMAP.md) - Overall migration plan
- [INTEGRATION_SUMMARY.md](./INTEGRATION_SUMMARY.md) - Previous hook integrations
- [React Hooks Documentation](https://react.dev/reference/react)

---

**Next Phase:** Phase 3.2 - UI Overlay Component Extraction
