// Game configuration constants and types for slot games
export interface GameConfig {
  // Display dimensions
  designWidth: number
  designHeight: number
  backgroundColor: number
  
  // Betting configuration
  denominationOptions: number[]
  betOptions: number[]
  defaultDenomination: number
  defaultBet: number
  
  // Game mechanics
  reelCount: number
  symbolsPerReel: number
  
  // Asset paths
  assetPaths: {
    mainResources: string
    reelImages: string
    background: string
    uiOverlay: string
    gambleResources: string
    sounds: {
      reel: string
      win: string
      short: string
    }
    animations: {
      wildExpanding: string
      symbolWins: string[]
    }
  }
  
  // Sound configuration
  soundConfig: {
    reelStop: {
      start: number
      end: number
      volume: number
    }
    wildReel: {
      start: number
      end: number
      volume: number
    }
    wildExpand: {
      start: number
      end: number
      volume: number
    }
  }
  
  // Game timing
  timing: {
    autoCollectDelay: number
    winAnimationDuration: number
    reelSpinDuration: number
    wildExpansionDelay: number
  }
}

// Default configuration for Shining Crown slot game
export const SHINING_CROWN_CONFIG: GameConfig = {
  // Display dimensions
  designWidth: 1920,
  designHeight: 1080,
  backgroundColor: 0x1a1a2e,
  
  // Betting configuration
  denominationOptions: [0.01, 0.10, 0.50, 1.00],
  betOptions: [5.00, 10.00, 20.00, 50.00, 100.00, 200.00, 500.00, 1000.00],
  defaultDenomination: 0.01,
  defaultBet: 5.00,
  
  // Game mechanics
  reelCount: 5,
  symbolsPerReel: 3,
  
  // Asset paths
  assetPaths: {
    mainResources: '/assets/mainResources.json',
    reelImages: '/assets/reelImages.json',
    background: '/assets/background.json',
    uiOverlay: '/assets/ui-cabinet-overlay.png',
    gambleResources: '/assets/gambleResources.json',
    sounds: {
      reel: '/assets/mobileMainSounds.mp3',
      win: '/assets/winSounds.mp3',
      short: '/assets/shortSounds.mp3'
    },
    animations: {
      wildExpanding: '/assets/08-0.json',
      symbolWins: [
        '/assets/00-0.json', // Cherry
        '/assets/01-0.json', // Lemon
        '/assets/02-0.json', // Orange
        '/assets/03-0.json', // Plum
        '/assets/04-0.json', // Bell
        '/assets/05-0.json', // Grapes
        '/assets/06-0.json', // Watermelon
        '/assets/07-0.json', // Seven
        '/assets/09-0.json', // Star
        '/assets/10-0.json', // Crown
      ]
    }
  },
  
  // Sound configuration
  soundConfig: {
    reelStop: {
      start: 1,
      end: 1.3,
      volume: 0.7
    },
    wildReel: {
      start: 0,
      end: 1,
      volume: 0.8
    },
    wildExpand: {
      start: 6.0,
      end: 10.3,
      volume: 0.9
    }
  },
  
  // Game timing (in milliseconds)
  timing: {
    autoCollectDelay: 4000,
    winAnimationDuration: 2000,
    reelSpinDuration: 2000,
    wildExpansionDelay: 1000
  }
}

// Helper function to get all asset paths for preloading
export function getAllAssetPaths(config: GameConfig): Array<string | { alias: string; src: string }> {
  const paths: Array<string | { alias: string; src: string }> = [
    config.assetPaths.mainResources,
    config.assetPaths.reelImages,
    config.assetPaths.background,
    '/assets/expand-0.json',
    config.assetPaths.animations.wildExpanding,
    ...config.assetPaths.animations.symbolWins,
    config.assetPaths.uiOverlay,
    config.assetPaths.gambleResources,
    // Sound assets with aliases
    { alias: 'reelSound', src: config.assetPaths.sounds.reel },
    { alias: 'winSound', src: config.assetPaths.sounds.win },
    { alias: 'shortSound', src: config.assetPaths.sounds.short }
  ]
  
  return paths
}

// Symbol mapping for easier reference
export const SYMBOL_IDS = {
  CHERRY: '00',
  LEMON: '01',
  ORANGE: '02',
  PLUM: '03',
  BELL: '04',
  GRAPES: '05',
  WATERMELON: '06',
  SEVEN: '07',
  WILD: '08',
  STAR: '09',
  CROWN: '10'
} as const

// Gamble feature constants
export const GAMBLE_CONFIG = {
  colors: ['red', 'black'] as const,
  stages: ['choice', 'reveal', 'result'] as const,
  maxWinMultiplier: 2,
  cardSuits: {
    red: ['♥', '♦'],
    black: ['♠', '♣']
  }
} as const

export type GambleColor = typeof GAMBLE_CONFIG.colors[number]
export type GambleStage = typeof GAMBLE_CONFIG.stages[number]