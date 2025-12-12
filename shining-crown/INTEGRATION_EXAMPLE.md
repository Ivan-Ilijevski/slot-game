# Quick Integration Example

This document shows the **exact changes** needed for a minimal integration of PixiGame into page.tsx.

## Changes Required

### 1. Add Import at Top

**Location**: Line 4 (after existing imports)

```tsx
import PixiGameIntegration from '../components/game/PixiGameIntegration'
```

### 2. Replace PIXI Container Div

**Location**: Around line 2981 (in the return statement)

**FIND THIS:**
```tsx
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

**REPLACE WITH:**
```tsx
<div
  style={{
    position: 'absolute',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
  }}
>
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
</div>
```

### 3. Comment Out Old PIXI Setup

**Location**: Lines 971-2925

**BEFORE:**
```tsx
  useEffect(() => {
    let app: Application | null = null
    let destroyed = false
    // ... 2000 lines of PIXI setup ...
  }, [])
```

**AFTER:**
```tsx
  // OLD PIXI SETUP - Replaced by PixiGameIntegration component
  // useEffect(() => {
  //   let app: Application | null = null
  //   let destroyed = false
  //   // ... 2000 lines of PIXI setup ...
  // }, [])
```

### 4. Handle Text Updates (Optional for MVP)

The new PixiGame component handles text rendering internally based on props.
The old code has a separate useEffect that updates text refs - this can be removed:

**Location**: Lines 2928-2932

```tsx
// Not needed anymore - PixiGame handles text updates via props
// useEffect(() => {
//   if (uiUpdateRef.current) {
//     uiUpdateRef.current(totalBalance, currentBet, lastWin)
//   }
// }, [totalBalance, currentBet, lastWin, denomination])
```

### 5. Remove Unused Refs (Optional Cleanup)

These refs are no longer needed since PixiGameIntegration handles them:

**Location**: Around line 181

**OPTIONAL CLEANUP:**
```tsx
// const pixiContainer = useRef<HTMLDivElement>(null)  // Not needed with PixiGameIntegration
```

Keep these refs (they're populated by PixiGameIntegration):
```tsx
const appRef = useRef<Application | null>(null)
const reelsRef = useRef<Container[]>([])
const reelContainerRef = useRef<Container | null>(null)
```

## Complete Minimal Diff

Here's a simplified view of all changes:

```diff
+'use client'
+
+import { useCallback, useEffect, useRef, useState } from 'react'
+import { Application, Assets, Sprite, Container, Graphics, Text } from 'pixi.js'
+// ... other imports ...
++ import PixiGameIntegration from '../components/game/PixiGameIntegration'

 export default function Home() {
   // ... all existing state and hooks ...

-  const pixiContainer = useRef<HTMLDivElement>(null)
   const appRef = useRef<Application | null>(null)
   const reelsRef = useRef<Container[]>([])
   const reelContainerRef = useRef<Container | null>(null)

   // ... all existing code ...

-  useEffect(() => {
-    let app: Application | null = null
-    let destroyed = false
-    // ... 2000 lines of PIXI setup ...
-  }, [])
+  // OLD PIXI SETUP - Replaced by PixiGameIntegration component
+  // useEffect(() => { ... }, [])

-  useEffect(() => {
-    if (uiUpdateRef.current) {
-      uiUpdateRef.current(totalBalance, currentBet, lastWin)
-    }
-  }, [totalBalance, currentBet, lastWin, denomination])
+  // Text updates handled by PixiGame props

   return (
     <div ...>
       // ... all existing UI components ...

-      <div
-        ref={pixiContainer}
-        style={{...}}
-      />
+      <div style={{...}}>
+        <PixiGameIntegration
+          denomination={denomination}
+          totalBalance={totalBalance}
+          currentBet={currentBet}
+          lastWin={lastWin}
+          currentLanguage={currentLanguage}
+          appRef={appRef}
+          reelsRef={reelsRef}
+          reelContainerRef={reelContainerRef}
+        />
+      </div>
     </div>
   )
 }
```

## Verification Steps

After making these changes:

1. **Save the file**
2. **Check for TypeScript errors** - Should compile cleanly
3. **Start dev server**: `npm run dev`
4. **Open browser**: http://localhost:3000
5. **Check browser console** for:
   ```
   ✅ PixiGame ready - refs populated: { app: true, reelsContainer: true, reelsCount: 5 }
   ```

6. **Visual check**:
   - Game should load and display
   - Reels should be visible
   - UI should show balance, bet, win
   - Background and overlays should render

7. **Test interactions**:
   - Click spin button (if it calls spin logic that uses refs)
   - Check if betting controls work
   - Try language toggle
   - Test denomination cycle

## Expected Results

✅ **Should Work:**
- Game loads and renders
- Reels display with initial symbols
- UI displays current state
- Responsive scaling
- All refs are populated

⚠️ **Might Need Adjustment:**
- Spin animations (depending on how spin logic accesses refs)
- Win animations (if they expect specific ref structure)
- Sound effects (should work if sound system is independent)
- Gamble feature (might need ref adjustments)

## Troubleshooting

### Issue: "PixiGame ready" message doesn't appear

**Solution**: Check browser console for errors. Make sure:
- Import path is correct
- Component files are saved
- Dev server restarted

### Issue: Reels don't display

**Solution**:
- Check if assets are loading (network tab)
- Verify `/assets/` folder exists and is accessible
- Check for CORS issues

### Issue: Spin button doesn't work

**Solution**:
- Check if `appRef.current` is populated
- Verify `reelsRef.current` has 5 containers
- Check console for errors when clicking spin

### Issue: TypeScript errors

**Solution**:
- Make sure `PixiGameIntegration.tsx` is in `src/components/game/`
- Verify all imports are correct
- Check that tsconfig.json excludes `**/*.UNUSED.*`

## Rollback

If something breaks, simply:

1. **Comment out** the PixiGameIntegration component
2. **Uncomment** the old useEffect
3. **Restore** the pixiContainer ref div
4. **Save and reload**

You can keep both versions in the file (commented) for easy switching during testing.

## Next Steps After Integration

Once the basic integration works:

1. **Test all features** systematically
2. **Fix any issues** with spin/win animations
3. **Optimize performance** if needed
4. **Remove commented code** once stable
5. **Extract more hooks** (optional, for cleaner code)

## Performance Expectations

The new PixiGame component should have **identical performance** to the vanilla setup because:
- Scene structure is declarative (one-time render)
- Animations remain imperative (no React reconciliation overhead)
- Ticker-based animations unchanged
- No additional re-renders during gameplay

## Summary

This integration:
- ✅ Requires **~10 lines changed** (import + component usage)
- ✅ Requires **~2000 lines commented** (old PIXI setup)
- ✅ Takes **5-10 minutes** to implement
- ✅ Provides **rollback safety** (keep old code commented)
- ✅ Results in **cleaner architecture** (separation of concerns)
- ✅ Maintains **full backward compatibility** (existing logic works with refs)

**Risk Level**: Low (can rollback immediately)
**Effort**: Minimal (simple find/replace)
**Benefit**: High (cleaner code, easier to maintain)
