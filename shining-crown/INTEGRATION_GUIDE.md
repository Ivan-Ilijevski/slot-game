# PixiGame Integration Guide

## Current State Analysis

The current `page.tsx` has a massive useEffect (lines 971-2925) that:
1. **Initializes PIXI** - Creates Application, canvas, handles resize
2. **Loads Assets** - All textures, sounds, JSON files
3. **Creates Scene** - Background, reels, UI overlays, text elements
4. **Sets up Functions** - Sound playback, reel animation logic, win highlights, gamble feature
5. **Wires Everything** - Connects all the game logic together

**Total Lines: ~1,950 lines** of tightly coupled game logic.

## Integration Strategy

### ⚠️ IMPORTANT: Do NOT Replace Everything At Once

The safest approach is a **gradual, phased integration**:

### Phase 1: Parallel Setup (Recommended First Step)

Run both the old and new PIXI setups side-by-side to verify the new component works:

```tsx
// At the top of Home component, add:
const [useNewPixi, setUseNewPixi] = useState(false) // Toggle for testing

// In the return statement:
{useNewPixi ? (
  // New PIXI React setup
  <PixiGameIntegration
    denomination={denomination}
    totalBalance={totalBalance}
    currentBet={currentBet}
    lastWin={lastWin}
    currentLanguage={currentLanguage}
    appRef={appRef}
    reelsRef={reelsRef}
    reelContainerRef={reelContainerRef}
  />
) : (
  // Old vanilla PIXI setup
  <div ref={pixiContainer} style={{...}} />
)}
```

This allows you to:
- ✅ Test the new component without breaking existing functionality
- ✅ Compare rendering side-by-side
- ✅ Verify all refs are populated correctly
- ✅ Toggle between old/new with a keyboard shortcut or debug panel

### Phase 2: Scene Rendering Only

Once Phase 1 works, the new PixiGame handles:
- ✅ Application initialization
- ✅ Asset loading
- ✅ Background rendering
- ✅ Reel containers and initial symbols
- ✅ UI overlays (cabinet, border, lines indicators)
- ✅ Text displays (balance, bet, win, denomination)

**What stays in page.tsx:**
- All game logic functions
- Spin animation code
- Win animation code
- Gamble feature code
- Sound management
- State management hooks

### Phase 3: Extract Sound Functions (Optional)

Create a `useSoundSystem` hook to centralize:
```tsx
const sounds = useSoundSystem()
// Returns: playReelStopSound, playWildReelSound, playWildExpandSound, etc.
```

### Phase 4: Extract Win Logic (Optional)

Create separate hooks for:
- `useWinHighlights` - Payline highlighting
- `useWinAnimations` - Symbol animation sequences
- `useWildExpansions` - Wild symbol expansion animations

### Phase 5: Extract Spin Logic (Already Done!)

You already have `useSpinLogic.ts` - just needs to work with PixiGame refs.

### Phase 6: Extract Gamble Feature (Optional)

Create `useGambleFeature` hook with all gamble-related logic.

## Quick Integration (Minimum Changes)

If you want to integrate with **minimal code changes**, here's the approach:

### Step 1: Add the Integration Component

In `page.tsx`, find the `pixiContainer` div (around line 2981):

```tsx
// BEFORE:
<div
  ref={pixiContainer}
  style={{
    position: 'absolute',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
  }}
/>
```

```tsx
// AFTER:
{typeof window !== 'undefined' && (
  <PixiGameIntegration
    denomination={denomination}
    totalBalance={totalBalance}
    currentBet={currentBet}
    lastWin={animatedWinAmount}  // Use animated amount for smooth updates
    currentLanguage={currentLanguage}
    appRef={appRef}
    reelsRef={reelsRef}
    reelContainerRef={reelContainerRef}
  />
)}
```

### Step 2: Comment Out Old PIXI Setup

Comment out the entire useEffect from lines 971-2925:

```tsx
// useEffect(() => {
//   // ... entire PIXI setup ...
// }, [])
```

**Keep everything else** - all the other hooks, functions, and logic.

### Step 3: Update Text Refs

The new PixiGame doesn't expose text refs yet. You have two options:

**Option A: Remove text updates temporarily**
```tsx
// Comment out the text update useEffect (lines 2928-2932)
```

**Option B: Add text refs to PixiGame** (requires modifying PixiGame.tsx)

### Step 4: Test

1. Start the dev server: `npm run dev`
2. Open the game
3. Check console for "✅ PixiGame ready - refs populated"
4. Verify reels are visible
5. Test if spin button works (if spin logic accesses refs)

## What Will Work Immediately

With the integration component:
- ✅ Game loads and displays
- ✅ Reels are visible with initial symbols
- ✅ Background and overlays render
- ✅ UI text displays current state
- ✅ Responsive scaling works

## What Needs Additional Work

These features need the refs to be connected to the existing logic:

- ⚠️ Reel spinning animations - `reelsRef` is populated, spin logic should work
- ⚠️ Win animations - Need to verify animation functions can access reels
- ⚠️ Wild expansions - Same as above
- ⚠️ Gamble feature - Might need additional integration
- ⚠️ Sound effects - Should work if sound system is independent
- ⚠️ Text updates - Need to add text refs to PixiGame or handle differently

## Debugging Tips

### Check if Refs are Populated

Add this after the PixiGame renders:

```tsx
useEffect(() => {
  console.log('Refs check:', {
    app: !!appRef.current,
    reels: reelsRef.current.length,
    reelsContainer: !!reelContainerRef.current
  })
}, [appRef.current])
```

### Enable Debug Logging

In `PixiGameIntegration.tsx`, the `handleGameReady` function already logs when ready.

### Test Individual Features

Add keyboard shortcuts to test features:

```tsx
useEffect(() => {
  const handleKeyPress = (e: KeyboardEvent) => {
    if (e.key === '1') {
      // Test spin
      console.log('Testing spin with refs:', reelsRef.current)
    }
    if (e.key === '2') {
      // Test win animation
      console.log('Testing win animation')
    }
  }

  window.addEventListener('keydown', handleKeyPress)
  return () => window.removeEventListener('keydown', handleKeyPress)
}, [])
```

## Rollback Plan

If something breaks:

1. **Immediate Rollback**: Uncomment the old useEffect, comment out PixiGameIntegration
2. **Partial Rollback**: Use the Phase 1 toggle approach to switch between implementations
3. **Git Rollback**: `git checkout HEAD -- src/app/page.tsx`

## Advanced: Full Migration

For a complete migration, you would need to:

1. Extract all game logic into custom hooks
2. Pass callbacks to PixiGame for events
3. Use PIXI React's `useTick` hook for animations
4. Convert imperative graphics drawing to declarative components
5. Use React state for all UI updates

**Estimated effort**: 40-80 hours depending on complexity
**Risk level**: High - many moving parts
**Reward**: Highly maintainable, testable codebase

## Recommended Approach

For your slot game with complex frame-perfect animations:

✅ **Use the Hybrid Approach**
- PixiGame handles scene structure (declarative)
- Keep animation logic imperative (for performance)
- Gradually extract hooks as needed
- Focus on maintainability over purity

**This gives you:**
- 80% of the benefits (clean structure, easier to understand)
- 20% of the effort (minimal refactoring)
- No performance loss (critical animations stay imperative)
- Easy to maintain and extend

## Next Steps

1. **[DONE]** ✅ Create PixiGame component
2. **[DONE]** ✅ Create PixiGameIntegration wrapper
3. **[TODO]** Test integration with Phase 1 (parallel setup)
4. **[TODO]** Verify refs are populated correctly
5. **[TODO]** Test spin logic with new refs
6. **[TODO]** Test win animations
7. **[TODO]** Test gamble feature
8. **[TODO]** Remove old PIXI setup once stable

## Support

If you encounter issues:

1. Check console for "✅ PixiGame ready" message
2. Verify refs are not null when accessed
3. Test individual features in isolation
4. Use the rollback plan if needed
5. Refer to PIXI_REACT_MIGRATION_COMPLETE.md for architecture details

---

**Remember**: The goal is **working game** > **perfect code**. The hybrid approach is a pragmatic solution that balances code quality with practical constraints.
