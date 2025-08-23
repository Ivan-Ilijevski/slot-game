// Win Animation and Sound System
// Handles win amount classification and appropriate sound/animation selection

export type WinType = 'small' | 'medium' | 'large' | 'mega' | 'wild' | 'scatter' | 'counting' | 'winStart' | 'twoSevens'

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
// Based on actual winSounds.mp3 file segments provided
export const WIN_SOUND_CONFIG: { [key in WinType]: WinSoundConfig } = {
  winStart: {
    alias: 'winSound',
    start: 0.0,    // Win start sound (always plays first)
    end: 2.0,      // 2 seconds duration
    volume: 0.6
  },
  small: {
    alias: 'winSound',
    start: 3.0,    // Win sound (moved from 0.0 to avoid overlap)
    end: 5.0,      // 2 seconds duration
    volume: 0.6
  },
  medium: {
    alias: 'winSound', 
    start: 3.0,    // Win sound
    end: 5.0,      // 2 seconds duration
    volume: 0.7
  },
  large: {
    alias: 'winSound',
    start: 16.0,   // Win sound
    end: 18.0,     // 2 seconds duration
    volume: 0.8
  },
  mega: {
    alias: 'winSound',
    start: 28.0,   // Win sound
    end: 32.0,     // 4 seconds duration
    volume: 0.9
  },
  wild: {
    alias: 'winSound',
    start: 6.0,    // Wild expansion sound (keeping existing)
    end: 10.3,     // 4.3 seconds for wild wins
    volume: 0.9
  },
  scatter: {
    alias: 'winSound',
    start: 11.0,   // Win sound for dollar scatter
    end: 13.0,     // 2 seconds duration
    volume: 0.8
  },
  counting: {
    alias: 'winSound',
    start: 41.0,   // Sound for win amount counting up
    end: 60.0,     // Till end of file (estimated)
    volume: 0.7
  },
  twoSevens: {
    alias: 'winSound',
    start: 37.0,   // Two sevens win sound
    end: 40.0,     // 3 seconds duration
    volume: 0.8
  }
}

// Animation configuration for different win types
export const WIN_ANIMATION_CONFIG: { [key in WinType]: WinTypeConfig } = {
  winStart: {
    type: 'winStart',
    threshold: 0,  // Always plays first regardless of amount
    animationSpeed: 100,
    animationIntensity: 'low',
    sound: WIN_SOUND_CONFIG.winStart,
    description: 'Win start - initial win sound'
  },
  small: {
    type: 'small',
    threshold: WIN_THRESHOLDS.SMALL,
    animationSpeed: 100,  // ms per frame (slower)
    animationIntensity: 'low',
    sound: WIN_SOUND_CONFIG.small,
    description: 'Small win - gentle animation'
  },
  medium: {
    type: 'medium', 
    threshold: WIN_THRESHOLDS.MEDIUM,
    animationSpeed: 80,   // ms per frame
    animationIntensity: 'medium',
    sound: WIN_SOUND_CONFIG.medium,
    description: 'Medium win - moderate animation'
  },
  large: {
    type: 'large',
    threshold: WIN_THRESHOLDS.LARGE, 
    animationSpeed: 60,   // ms per frame (faster)
    animationIntensity: 'high',
    sound: WIN_SOUND_CONFIG.large,
    description: 'Large win - intense animation'
  },
  mega: {
    type: 'mega',
    threshold: WIN_THRESHOLDS.MEGA,
    animationSpeed: 40,   // ms per frame (fastest)
    animationIntensity: 'epic',
    sound: WIN_SOUND_CONFIG.mega,
    description: 'Mega win - epic animation'
  },
  wild: {
    type: 'wild',
    threshold: 0,  // Any amount with wilds
    animationSpeed: 50,   // ms per frame (very fast for wilds)
    animationIntensity: 'epic',
    sound: WIN_SOUND_CONFIG.wild,
    description: 'Wild win - special animation and sound'
  },
  scatter: {
    type: 'scatter',
    threshold: 0,  // Special scatter wins
    animationSpeed: 70,   // ms per frame
    animationIntensity: 'high',
    sound: WIN_SOUND_CONFIG.scatter,
    description: 'Scatter win - special dollar scatter'
  },
  counting: {
    type: 'counting',
    threshold: 0,  // Used for win counting animation
    animationSpeed: 60,   // ms per frame
    animationIntensity: 'medium',
    sound: WIN_SOUND_CONFIG.counting,
    description: 'Win counting - amount counting up sound'
  },
  twoSevens: {
    type: 'twoSevens',
    threshold: 0,  // Special case - not based on threshold
    animationSpeed: 70,   // ms per frame
    animationIntensity: 'high',
    sound: WIN_SOUND_CONFIG.twoSevens,
    description: 'Two Sevens - special win sound'
  }
}

/**
 * Classifies a win amount based on the current bet and win lines
 * @param winAmount - The total win amount in currency
 * @param currentBet - The current bet amount in currency
 * @param winLines - Array of win line objects to analyze
 * @param hasWilds - Whether the win contains wild symbols
 * @returns The win type classification
 */
export function classifyWin(
  winAmount: number, 
  currentBet: number, 
  winLines: Array<{ symbol: string, count: number }> = [], 
  hasWilds: boolean = false
): WinType {
  // Special case for wild symbols - always use wild classification
  if (hasWilds) {
    return 'wild'
  }
  
  // Special case for two sevens - check before standard classification
  const hasTwoSevens = winLines.some(line => 
    line.symbol === 'Seven' && line.count === 2
  )
  if (hasTwoSevens) {
    return 'twoSevens'
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
 * @param winLines - Array of win line objects (to check for wilds and specific symbols)
 * @returns The win type configuration
 */
export function getWinConfig(
  winAmount: number, 
  currentBet: number, 
  winLines: Array<{ symbol: string, count?: number }> = []
): WinTypeConfig {
  const hasWilds = hasWildSymbols(winLines)
  // Convert winLines to format expected by classifyWin
  const winLinesWithCount = winLines.map(line => ({
    symbol: line.symbol,
    count: line.count || 0
  }))
  const winType = classifyWin(winAmount, currentBet, winLinesWithCount, hasWilds)
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
  
  const soundConfig = WIN_SOUND_CONFIG[winType] || WIN_SOUND_CONFIG.small
  console.log(`🔊 Attempting to play ${winType} sound:`, soundConfig)
  
  try {
    (soundInstance as any).play(soundConfig.alias, {
      start: soundConfig.start,
      end: soundConfig.end,
      volume: soundConfig.volume
    })
    console.log(`✅ Successfully triggered ${winType} sound`)
  } catch (error) {
    console.error('❌ Error playing win sound:', error)
  }
}

/**
 * Plays the win counting sound for amount counting up animation
 * @param soundInstance - The PIXI sound instance
 */
export function playWinCountingSound(soundInstance: unknown): void {
  if (!soundInstance) {
    console.warn('Sound instance not available')
    return
  }
  
  playWinSound('counting', soundInstance)
}

/**
 * Plays the scatter win sound for dollar scatter symbols
 * @param soundInstance - The PIXI sound instance
 */
export function playScatterSound(soundInstance: unknown): void {
  if (!soundInstance) {
    console.warn('Sound instance not available')  
    return
  }
  
  playWinSound('scatter', soundInstance)
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
    case 'twoSevens':
      return 'TWO SEVENS!'
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
    case 'winStart':
      return 0xFFD700  // Gold (for win start)
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
    case 'scatter':
      return 0x00FF00  // Green (for scatter/dollar)
    case 'counting':
      return 0x00FFFF  // Cyan (for counting)
    case 'twoSevens':
      return 0xFF6347  // Tomato red (distinctive color for two sevens)
    default:
      return 0xFFFFFF  // White
  }
}

// Sound Queue System for Sequential Win Sound Management
interface SoundQueueItem {
  type: WinType
  delay?: number // Delay in ms before playing this sound
}

interface SoundQueueState {
  queue: SoundQueueItem[]
  currentIndex: number
  isPlaying: boolean
  timeoutId: NodeJS.Timeout | null
  soundInstance: unknown
  isGambleMode: boolean
}

let soundQueue: SoundQueueState = {
  queue: [],
  currentIndex: 0,
  isPlaying: false,
  timeoutId: null,
  soundInstance: null,
  isGambleMode: false
}

/**
 * Starts a sequential win sound sequence
 * @param winAmount - The total win amount
 * @param currentBet - The current bet amount
 * @param winLines - Array of win lines (to check for wilds)
 * @param soundInstance - The PIXI sound instance
 * @param hasWildExpansion - Whether wild expansion sounds are playing first
 * @param isGambleMode - Whether gamble mode is active (prevents win sounds)
 */
export function startWinSoundSequence(
  winAmount: number,
  currentBet: number,
  winLines: Array<{ symbol: string }>,
  soundInstance: unknown,
  hasWildExpansion: boolean = false,
  isGambleMode: boolean = false
): void {
  console.log('🎵 Starting win sound sequence', { winAmount, currentBet, hasWildExpansion, isGambleMode })
  
  // Stop any existing sequence
  stopWinSoundSequence()
  
  // Don't play win sounds in gamble mode
  if (isGambleMode) {
    console.log('🚫 Win sounds skipped - gamble mode active')
    return
  }
  
  if (!soundInstance) {
    console.warn('🚫 Sound instance not available for win sequence')
    return
  }
  
  // Build sound sequence
  const sequence: SoundQueueItem[] = []
  
  // 1. Win Start Sound (always first, after wild expansion if present)
  const startDelay = hasWildExpansion ? 4300 : 0 // Wait for wild expansion to complete
  sequence.push({ type: 'winStart', delay: startDelay })
  
  // 2. Bet-specific Win Sound
  const hasWilds = hasWildSymbols(winLines)
  const winLinesWithCount = winLines.map(line => ({
    symbol: line.symbol,
    count: line.count || 0
  }))
  const winType = classifyWin(winAmount, currentBet, winLinesWithCount, hasWilds)
  
  if (winType !== 'wild') { // Don't duplicate wild sounds
    sequence.push({ type: winType, delay: 2200 }) // Wait for win start to complete
  }
  
  console.log('🎵 Sound sequence created:', sequence.map(s => s.type))
  
  // Initialize queue
  soundQueue = {
    queue: sequence,
    currentIndex: 0,
    isPlaying: true,
    timeoutId: null,
    soundInstance,
    isGambleMode
  }
  
  // Start playing sequence
  playNextInSequence()
}

/**
 * Plays the next sound in the sequence
 */
function playNextInSequence(): void {
  if (!soundQueue.isPlaying || soundQueue.isGambleMode) {
    return
  }
  
  if (soundQueue.currentIndex >= soundQueue.queue.length) {
    console.log('🎵 Win sound sequence completed')
    soundQueue.isPlaying = false
    return
  }
  
  const currentItem = soundQueue.queue[soundQueue.currentIndex]
  console.log(`🎵 Playing sound ${soundQueue.currentIndex + 1}/${soundQueue.queue.length}: ${currentItem.type}`)
  
  const playSound = () => {
    if (!soundQueue.isPlaying || soundQueue.isGambleMode) return
    
    playWinSound(currentItem.type, soundQueue.soundInstance)
    soundQueue.currentIndex++
    
    // Schedule next sound
    const nextItem = soundQueue.queue[soundQueue.currentIndex]
    if (nextItem) {
      soundQueue.timeoutId = setTimeout(playNextInSequence, nextItem.delay || 0)
    } else {
      soundQueue.isPlaying = false
    }
  }
  
  // Apply delay if specified
  if (currentItem.delay && currentItem.delay > 0) {
    soundQueue.timeoutId = setTimeout(playSound, currentItem.delay)
  } else {
    playSound()
  }
}

/**
 * Stops the current win sound sequence
 */
export function stopWinSoundSequence(): void {
  if (soundQueue.timeoutId) {
    clearTimeout(soundQueue.timeoutId)
    soundQueue.timeoutId = null
  }
  
  if (soundQueue.isPlaying && soundQueue.soundInstance) {
    console.log('🔇 Stopping win sound sequence')
    try {
      (soundQueue.soundInstance as any).stop('winSound')
    } catch (error) {
      console.warn('Error stopping win sound sequence:', error)
    }
  }
  
  soundQueue.isPlaying = false
  soundQueue.currentIndex = 0
  soundQueue.queue = []
}

/**
 * Updates gamble mode state to prevent win sounds
 * @param isGambleMode - Whether gamble mode is active
 */
export function updateGambleModeState(isGambleMode: boolean): void {
  soundQueue.isGambleMode = isGambleMode
  
  if (isGambleMode && soundQueue.isPlaying) {
    console.log('🚫 Stopping win sounds - gamble mode entered')
    stopWinSoundSequence()
  }
}

/**
 * Starts the counting sound during win amount animation
 * @param soundInstance - The PIXI sound instance
 */
export function startWinCountingSound(soundInstance: unknown): void {
  if (!soundInstance || soundQueue.isGambleMode) {
    return
  }
  
  console.log('🎵 Starting win counting sound')
  playWinSound('counting', soundInstance)
}

/**
 * Stops the counting sound
 * @param soundInstance - The PIXI sound instance
 */
export function stopWinCountingSound(soundInstance: unknown): void {
  if (!soundInstance) {
    return
  }
  
  console.log('🔇 Stopping win counting sound')
  try {
    (soundInstance as any).stop('winSound')
  } catch (error) {
    console.warn('Error stopping counting sound:', error)
  }
}