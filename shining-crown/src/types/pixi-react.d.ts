import type { PixiElements } from '@pixi/react'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      // Pixi.js components with 'pixi' prefix
      pixiContainer: PixiElements['pixiContainer']
      pixiSprite: PixiElements['pixiSprite']
      pixiGraphics: PixiElements['pixiGraphics']
      pixiText: PixiElements['pixiText']
    }
  }
}
