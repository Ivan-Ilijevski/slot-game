# PIXI React Quick Start Guide

## How to Use the New PixiGame Component

### Basic Usage

```tsx
import PixiGame, { PixiGameHandle } from '@/components/game/PixiGame'

function YourComponent() {
  const pixiHandleRef = useRef<PixiGameHandle | null>(null)

  return (
    <PixiGame
      denomination={0.10}
      totalBalance={1000.00}
      currentBet={10.00}
      lastWin={0}
      currentLanguage="en"
      onGameReady={(handle) => {
        pixiHandleRef.current = handle

        // Now you can access PIXI objects:
        const app = handle.getApp()
        const reels = handle.getReels()
        const reelsContainer = handle.getReelsContainer()
      }}
    />
  )
}
```

### Accessing PIXI Objects for Animations

The existing animation logic (spin, win animations) can access PIXI objects through the handle:

```tsx
// In your spin logic hook/function
const spinReels = useCallback(() => {
  if (!pixiHandleRef.current) return

  const app = pixiHandleRef.current.getApp()
  const reels = pixiHandleRef.current.getReels()

  // Use app.ticker for frame-perfect animations
  app.ticker.add((ticker) => {
    // Your animation logic here
  })

  // Manipulate reel containers
  reels.forEach((reel, index) => {
    if (reel) {
      // Access symbols: reel.children[2+] (skip mask at 0, overshoot at 1)
      // Animate position: reel.y += speed
    }
  })
}, [])
```

### Component Props

```typescript
interface PixiGameProps {
  denomination: number          // Current denomination (e.g., 0.10)
  totalBalance: number           // Player's total balance in currency
  currentBet: number             // Current bet amount in currency
  lastWin: number                // Last win amount in currency
  currentLanguage: 'en' | 'mk'   // UI language
  onIncreaseBet?: () => void     // Optional: Bet increase callback
  onDecreaseBet?: () => void     // Optional: Bet decrease callback
  onSpinReels?: () => void       // Optional: Spin callback
  onGameReady?: (handle: PixiGameHandle) => void  // Game ready callback
}
```

### Exposed API

```typescript
interface PixiGameHandle {
  getApp: () => Application           // Get PIXI Application instance
  getReelsContainer: () => Container | null  // Get main reels container
  getReels: () => (Container | null)[]      // Get array of 5 reel containers
}
```

## Adding Custom PIXI Components

### Example: Adding a Custom Sprite

```tsx
// In PixiGame.tsx GameContent component:

<pixiContainer scale={props.scale}>
  {/* Existing components... */}

  {/* Your custom sprite */}
  <pixiSprite
    texture={myTexture}
    x={100}
    y={200}
    width={260}
    height={260}
    anchor={0.5}
    scale={1.5}
    rotation={0.5}
  />
</pixiContainer>
```

### Example: Adding Graphics

```tsx
const drawCustomShape = useCallback((g: Graphics) => {
  g.clear()
  g.circle(0, 0, 50)
  g.fill(0xFF0000)
}, [])

<pixiGraphics
  x={500}
  y={500}
  draw={drawCustomShape}
/>
```

### Example: Adding Animated Text

```tsx
const [score, setScore] = useState(0)

<pixiText
  text={`Score: ${score}`}
  x={960}
  y={100}
  anchor={0.5}
  style={new TextStyle({
    fontFamily: 'Arial',
    fontSize: 48,
    fill: 0xFFFFFF,
    fontWeight: 'bold'
  })}
/>
```

## Component Registration

To use PIXI classes as JSX elements, they must be registered with `extend()`:

```tsx
import { extend } from '@pixi/react'
import { Container, Sprite, Graphics, Text, AnimatedSprite } from 'pixi.js'

extend({
  Container,
  Sprite,
  Graphics,
  Text,
  AnimatedSprite  // Add new components here
})

// Now you can use:
<pixiAnimatedSprite textures={frames} animationSpeed={0.5} />
```

## Common Patterns

### Responsive Scaling

```tsx
const [scale, setScale] = useState(1)

useEffect(() => {
  const handleResize = () => {
    const scaleX = window.innerWidth / DESIGN_WIDTH
    const scaleY = window.innerHeight / DESIGN_HEIGHT
    setScale(Math.min(scaleX, scaleY))
  }

  handleResize()
  window.addEventListener('resize', handleResize)
  return () => window.removeEventListener('resize', handleResize)
}, [])

<pixiContainer scale={scale}>
  {/* Content scales automatically */}
</pixiContainer>
```

### Conditional Rendering

```tsx
{isGameOver && (
  <pixiText
    text="GAME OVER"
    x={960}
    y={540}
    anchor={0.5}
    style={gameOverStyle}
  />
)}
```

### Dynamic Lists

```tsx
{symbols.map((symbol, index) => (
  <pixiSprite
    key={`symbol-${index}`}
    texture={symbolAtlas.textures[symbol]}
    x={index * 100}
    y={0}
  />
))}
```

### Refs for Imperative Control

```tsx
const containerRef = useRef<Container>(null)

useEffect(() => {
  if (containerRef.current) {
    // Direct PIXI manipulation when needed
    containerRef.current.alpha = 0.5
  }
}, [])

<pixiContainer ref={containerRef}>
  {/* Children */}
</pixiContainer>
```

## Best Practices

### ✅ DO

- Use declarative JSX for scene structure
- Use props for data that changes
- Memoize draw functions with `useCallback`
- Store PIXI refs for animations that need direct control
- Use `useApplication()` to access the app instance
- Register components with `extend()` before use

### ❌ DON'T

- Don't use hooks inside `.map()` callbacks
- Don't create functions inside JSX (use `useCallback`)
- Don't mutate PIXI objects directly if props can handle it
- Don't forget to clean up ticker functions
- Don't use arrays for anchor/scale (use objects or numbers)

## Performance Tips

1. **Memoize expensive calculations**
   ```tsx
   const textStyle = useMemo(() => new TextStyle({...}), [])
   ```

2. **Use refs for high-frequency updates**
   ```tsx
   // Instead of setState 60 times per second:
   const sprite = spriteRef.current
   sprite.x += velocity.x
   ```

3. **Batch state updates**
   ```tsx
   // Better:
   setState(prev => ({ ...prev, x: newX, y: newY }))

   // Than:
   setX(newX)
   setY(newY)
   ```

4. **Keep ticker functions clean**
   ```tsx
   useEffect(() => {
     const animate = () => { /* animation */ }
     app.ticker.add(animate)
     return () => app.ticker.remove(animate)  // Always cleanup!
   }, [app])
   ```

## Troubleshooting

### Component Not Rendering
- Check if you called `extend()` for that component type
- Verify texture/asset is loaded
- Check for TypeScript errors in props

### Performance Issues
- Use refs for high-frequency updates instead of state
- Avoid creating functions in JSX
- Check for memory leaks (unmounted components still in ticker)

### TypeScript Errors
- Ensure `src/types/pixi-react.d.ts` is included in tsconfig
- Use correct prop types (anchor: number | PointData, not array)
- Import from `pixi.js`, not `@pixi/react`

## Resources

- [@pixi/react GitHub](https://github.com/pixijs/pixi-react)
- [PIXI.js Documentation](https://pixijs.com/docs)
- [Migration Guide](./PIXI_REACT_MIGRATION_COMPLETE.md)
