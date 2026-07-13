import { Assets, Container, Graphics, Sprite, Text } from 'pixi.js'

// Gamble UI elements bag attached to the gamble container; the gamble flow in
// page.tsx reads it via gambleContainerRef and mutates these objects directly.
export interface GambleElements {
  faceDownCard: Sprite
  faceUpCard: Sprite
  gambleAmountText: Text
  gambleToWinText: Text
  instructionsText: Text
  historyContainer: Container
}

export type GambleContainer = Container & { gambleElements: GambleElements }

/**
 * Build the gamble (double-or-nothing) overlay UI and mount it on the stage.
 * Lifted verbatim from the page.tsx monolith's setupGambleUI.
 * Returns the hidden container carrying the gambleElements bag.
 */
export function createGambleUI(stage: Container): GambleContainer {
  const gambleAtlas = Assets.get('/assets/gambleResources.json')

  // Create gamble container (initially hidden)
  const gambleContainer = new Container() as GambleContainer
  gambleContainer.visible = false
  stage.addChild(gambleContainer)

  // Create semi-transparent background overlay
  const overlay = new Graphics()
  overlay.rect(0, 0, 1920, 1080)
  overlay.fill({ color: 0x000000, alpha: 0.7 }) // Black with 70% opacity
  gambleContainer.addChild(overlay)

  // Card display area - center of screen
  const cardX = 1920 / 2
  const cardY = 1080 / 2 - 50

  // Face-down card (initially visible)
  const faceDownCard = new Sprite(gambleAtlas.textures['cardBackRed.png'])
  faceDownCard.anchor.set(0.5)
  faceDownCard.x = cardX
  faceDownCard.y = cardY
  faceDownCard.scale.set(1.5)
  gambleContainer.addChild(faceDownCard)

  // Face-up card (initially hidden)
  const faceUpCard = new Sprite(gambleAtlas.textures['cardFront0.png'])
  faceUpCard.anchor.set(0.5)
  faceUpCard.x = cardX
  faceUpCard.y = cardY
  faceUpCard.scale.set(1.5)
  faceUpCard.visible = false
  gambleContainer.addChild(faceUpCard)

  // Button container (red/black buttons removed - mobile/keyboard controls)
  const buttonsContainer = new Container()
  gambleContainer.addChild(buttonsContainer)

  // Gamble amount text (top left)
  const gambleAmountText = new Text({
    text: 'GAMBLE AMOUNT\n0',
    style: {
      fontFamily: 'Arial Black',
      fontSize: 48,
      fill: 0xFFFFFF,
      stroke: { color: 0x000000, width: 3 }
    }
  })
  gambleAmountText.anchor.set(0, 0.5)
  gambleAmountText.x = cardX - 800
  gambleAmountText.y = cardY - 200
  gambleContainer.addChild(gambleAmountText)

  // Gamble to win text (top right)
  const gambleToWinText = new Text({
    text: 'GAMBLE TO WIN\n0',
    style: {
      fontFamily: 'Arial Black',
      fontSize: 48,
      fill: 0xFFFFFF,
      stroke: { color: 0x000000, width: 3 },
      align: 'right'
    }
  })
  gambleToWinText.anchor.set(1, 0.5)
  gambleToWinText.x = cardX + 800
  gambleToWinText.y = cardY - 200
  gambleContainer.addChild(gambleToWinText)

  // Instructions text
  const instructionsText = new Text({
    text: 'Choose RED or BLACK',
    style: {
      fontFamily: 'Arial',
      fontSize: 24,
      fill: 0xFFFFFF,
      align: 'center'
    }
  })
  instructionsText.anchor.set(0.5)
  instructionsText.x = cardX
  instructionsText.y = cardY + 250
  gambleContainer.addChild(instructionsText)

  // History container for showing previous gamble results
  const historyContainer = new Container()
  historyContainer.x = cardX
  historyContainer.y = cardY - 350
  gambleContainer.addChild(historyContainer)

  gambleContainer.gambleElements = {
    faceDownCard,
    faceUpCard,
    gambleAmountText,
    gambleToWinText,
    instructionsText,
    historyContainer
  }

  return gambleContainer
}
