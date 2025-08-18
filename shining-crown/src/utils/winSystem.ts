// Win Animation and Sound System
// Handles win amount classification and appropriate sound/animation selection

export type WinType = 'small' | 'medium' | 'large' | 'mega' | 'wild'

export interface WinSoundConfig {
  alias: string
  start: number
  end: number
  volume: number
}

export interface WinTypeConfig {
  type: WinType
  threshold: number
  animationSpeed: number
  animationIntensity: 'low' | 'medium' | 'high' | 'epic'
  sound: WinSoundConfig
  description: string
}

// Win amount thresholds based on current bet amount
export const WIN_THRESHOLDS = {
  SMALL: 1,    // 1x bet or less
  MEDIUM: 5,   // 5x bet 
  LARGE: 20,   // 20x bet
  MEGA: 50     // 50x bet or more
}

// Sound configuration for different win types and wild symbols
// Based on winSounds.mp3 file segments
export const WIN_SOUND_CONFIG: { [key in WinType]: WinSoundConfig } = {
  small: {
    alias: 'winSound',
    start: 0,      // Beginning of winSounds.mp3
    end: 2.5,      // 2.5 seconds for small wins
    volume: 0.6
  },
  medium: {
    alias: 'winSound', 
    start: 2.5,    // After small win sound
    end: 5.5,      // 3 seconds for medium wins
    volume: 0.7
  },
  large: {
    alias: 'winSound',
    start: 5.5,    // After medium win sound  
    end: 10.0,     // 4.5 seconds for large wins
    volume: 0.8
  },
  mega: {
    alias: 'winSound',
    start: 10.0,   // After large win sound
    end: 15.0,     // 5 seconds for mega wins
    volume: 0.9
  },
  wild: {
    alias: 'winSound',
    start: 6.0,    // Wild expansion sound (existing)
    end: 10.3,     // 4.3 seconds for wild wins
    volume: 0.9
  }
}

// Animation configuration for different win types
export const WIN_ANIMATION_CONFIG: { [key in WinType]: WinTypeConfig } = {
  small: {
    type: 'small',
    threshold: WIN_THRESHOLDS.SMALL,
    animationSpeed: 100,  // ms per frame (slower)
    animationIntensity: 'low',
    sound: { alias: 'winSound', start: 0, end: 2.5, volume: 0.6 },
    description: 'Small win - gentle animation'
  },
  medium: {
    type: 'medium', 
    threshold: WIN_THRESHOLDS.MEDIUM,
    animationSpeed: 80,   // ms per frame
    animationIntensity: 'medium',
    sound: { alias: 'winSound', start: 2.5, end: 5.5, volume: 0.7 },
    description: 'Medium win - moderate animation'
  },
  large: {
    type: 'large',
    threshold: WIN_THRESHOLDS.LARGE, 
    animationSpeed: 60,   // ms per frame (faster)
    animationIntensity: 'high',
    sound: { alias: 'winSound', start: 5.5, end: 10.0, volume: 0.8 },
    description: 'Large win - intense animation'
  },
  mega: {
    type: 'mega',
    threshold: WIN_THRESHOLDS.MEGA,
    animationSpeed: 40,   // ms per frame (fastest)
    animationIntensity: 'epic',
    sound: { alias: 'winSound', start: 10.0, end: 15.0, volume: 0.9 },
    description: 'Mega win - epic animation'
  },
  wild: {
    type: 'wild',
    threshold: 0,  // Any amount with wilds
    animationSpeed: 50,   // ms per frame (very fast for wilds)
    animationIntensity: 'epic',
    sound: { alias: 'winSound', start: 6.0, end: 10.3, volume: 0.9 },
    description: 'Wild win - special animation and sound'
  }
}

/**
 * Classifies a win amount based on the current bet
 * @param winAmount - The total win amount in currency
 * @param currentBet - The current bet amount in currency
 * @param hasWilds - Whether the win contains wild symbols
 * @returns The win type classification
 */
export function classifyWin(winAmount: number, currentBet: number, hasWilds: boolean = false): WinType {
  // Special case for wild symbols - always use wild classification
  if (hasWilds) {
    return 'wild'
  }
  
  // Calculate win multiplier (win amount / bet amount)
  const multiplier = winAmount / currentBet
  
  // Classify based on multiplier thresholds
  if (multiplier >= WIN_THRESHOLDS.MEGA) {
    return 'mega'
  } else if (multiplier >= WIN_THRESHOLDS.LARGE) {
    return 'large'
  } else if (multiplier >= WIN_THRESHOLDS.MEDIUM) {
    return 'medium'
  } else {
    return 'small'
  }
}

/**
 * Checks if win lines contain wild symbols
 * @param winLines - Array of win line objects
 * @returns True if any win line contains wilds
 */
export function hasWildSymbols(winLines: Array<{ symbol: string }>): boolean {
  return winLines.some(line => line.symbol === 'Wild' || line.symbol === '08' || line.symbol === 'Wild.png')
}

/**
 * Gets the appropriate animation configuration for a win
 * @param winAmount - The total win amount
 * @param currentBet - The current bet amount
 * @param winLines - Array of win line objects (to check for wilds)
 * @returns The win type configuration
 */
export function getWinConfig(
  winAmount: number, 
  currentBet: number, 
  winLines: Array<{ symbol: string }> = []
): WinTypeConfig {
  const hasWilds = hasWildSymbols(winLines)
  const winType = classifyWin(winAmount, currentBet, hasWilds)
  return WIN_ANIMATION_CONFIG[winType]
}

/**
 * Plays the appropriate win sound based on win type
 * @param winType - The classified win type
 * @param soundInstance - The PIXI sound instance
 */
export function playWinSound(winType: WinType, soundInstance: unknown): void {
  if (!soundInstance) {
    console.warn('Sound instance not available')
    return
  }
  
  let soundConfig: WinSoundConfig
  
  switch (winType) {
    case 'small':
      soundConfig = { alias: 'winSound', start: 0, end: 2.5, volume: 0.6 }
      break
    case 'medium':
      soundConfig = { alias: 'winSound', start: 2.5, end: 5.5, volume: 0.7 }
      break
    case 'large':
      soundConfig = { alias: 'winSound', start: 5.5, end: 10.0, volume: 0.8 }
      break
    case 'mega':
      soundConfig = { alias: 'winSound', start: 10.0, end: 15.0, volume: 0.9 }
      break
    case 'wild':
      soundConfig = { alias: 'winSound', start: 6.0, end: 10.3, volume: 0.9 }
      break
    default:
      soundConfig = { alias: 'winSound', start: 0, end: 2.5, volume: 0.6 }
  }
  
  (soundInstance as any).play(soundConfig.alias, {
    start: soundConfig.start,
    end: soundConfig.end,
    volume: soundConfig.volume
  })
}

/**
 * Gets animation speed based on win type
 * @param winType - The classified win type
 * @returns Animation speed in milliseconds per frame
 */
export function getAnimationSpeed(winType: WinType): number {
  return WIN_ANIMATION_CONFIG[winType].animationSpeed
}

/**
 * Formats win type for display
 * @param winType - The win type
 * @returns Formatted string for UI display
 */
export function formatWinType(winType: WinType): string {
  switch (winType) {
    case 'small':
      return 'Nice Win!'
    case 'medium':
      return 'Good Win!'
    case 'large':
      return 'Big Win!'
    case 'mega':
      return 'MEGA WIN!'
    case 'wild':
      return 'WILD WIN!'
    default:
      return 'Win!'
  }
}

/**
 * Gets color theme for win type
 * @param winType - The win type
 * @returns Color value for UI theming
 */
export function getWinColor(winType: WinType): number {
  switch (winType) {
    case 'small':
      return 0xFFFF00  // Yellow
    case 'medium':
      return 0xFF8C00  // Orange
    case 'large':
      return 0xFF4500  // Red-Orange
    case 'mega':
      return 0xFF0000  // Red
    case 'wild':
      return 0x9400D3  // Purple (for wild)
    default:
      return 0xFFFFFF  // White
  }
}