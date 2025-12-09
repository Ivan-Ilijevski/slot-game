/**
 * Game Constants
 *
 * Centralized configuration values for the slot game.
 * Loads from gameConfig.json for easy configuration without code changes.
 * Extracted from page.tsx for better maintainability and consistency.
 */

import gameConfigJson from '../../public/assets/gameConfig.json'

/**
 * Game configuration loaded from JSON
 */
export const GAME_CONFIG = gameConfigJson

/**
 * Available bet options in MKD currency
 * These are the preset bet amounts players can choose from
 */
export const BET_OPTIONS = GAME_CONFIG.betOptions as readonly number[]

/**
 * Available denomination options for the game
 * Players can cycle through these values to change bet denomination
 */
export const DENOMINATION_OPTIONS = GAME_CONFIG.denominationOptions as readonly number[]

/**
 * Default game values
 */
export const DEFAULT_VALUES = {
  /** Default bet amount when game starts */
  BET: GAME_CONFIG.defaultValues.bet,

  /** Default denomination when game starts */
  DENOMINATION: GAME_CONFIG.defaultValues.denomination,

  /** Default language */
  LANGUAGE: GAME_CONFIG.defaultValues.language as 'en' | 'mk',

  /** Default balance (loaded from server) */
  BALANCE: GAME_CONFIG.defaultValues.balance,
} as const

/**
 * Win collection timing configuration
 */
export const WIN_COLLECTION_CONFIG = {
  /** Duration of win amount counting animation (ms) */
  ANIMATION_DURATION: GAME_CONFIG.winCollection.animationDuration,

  /** Auto-collect timeout after win animation completes (ms) */
  AUTO_COLLECT_DELAY: GAME_CONFIG.winCollection.autoCollectDelay,

  /** Shortened auto-collect delay after "take win" is pressed (ms) */
  TAKE_WIN_DELAY: GAME_CONFIG.winCollection.takeWinDelay,
} as const

/**
 * Autostart configuration
 */
export const AUTOSTART_CONFIG = {
  /** Default autostart state */
  DEFAULT_ENABLED: GAME_CONFIG.autostart.defaultEnabled,

  /** Delay before auto-spin after a normal spin (ms) */
  NORMAL_DELAY: GAME_CONFIG.autostart.normalDelay,

  /** Delay before auto-spin after a win (ms) */
  WIN_DELAY: GAME_CONFIG.autostart.winDelay,
} as const

/**
 * Language options
 */
export const LANGUAGES = GAME_CONFIG.languages as readonly string[]
export type Language = 'en' | 'mk'

/**
 * Gamble stage types
 */
export const GAMBLE_STAGES = GAME_CONFIG.gambleStages as readonly string[]
export type GambleStage = 'choice' | 'reveal' | 'result'

/**
 * Gamble color options
 */
export const GAMBLE_COLORS = GAME_CONFIG.gambleColors as readonly string[]
export type GambleColor = 'red' | 'black'

/**
 * Message popup types
 */
export const MESSAGE_TYPES = GAME_CONFIG.messageTypes as readonly string[]
export type MessageType = 'success' | 'error' | 'info' | 'warning'

/**
 * Type exports for better TypeScript support
 */
export type BetOption = typeof BET_OPTIONS[number]
export type DenominationOption = typeof DENOMINATION_OPTIONS[number]

/**
 * Helper functions for game constants
 */

/**
 * Get the next bet option in the cycle
 */
export const getNextBet = (currentBet: number): number => {
  const index = BET_OPTIONS.indexOf(currentBet)
  if (index === -1) return BET_OPTIONS[0]
  return BET_OPTIONS[(index + 1) % BET_OPTIONS.length]
}

/**
 * Get the previous bet option
 */
export const getPreviousBet = (currentBet: number): number => {
  const index = BET_OPTIONS.indexOf(currentBet)
  if (index === -1) return BET_OPTIONS[0]
  const prevIndex = index === 0 ? BET_OPTIONS.length - 1 : index - 1
  return BET_OPTIONS[prevIndex]
}

/**
 * Get the maximum bet
 */
export const getMaxBet = (): number => {
  return BET_OPTIONS[BET_OPTIONS.length - 1]
}

/**
 * Get the minimum bet
 */
export const getMinBet = (): number => {
  return BET_OPTIONS[0]
}

/**
 * Check if a bet is valid
 */
export const isValidBet = (bet: number): boolean => {
  return BET_OPTIONS.includes(bet)
}

/**
 * Get the next denomination in the cycle
 */
export const getNextDenomination = (currentDenom: number): number => {
  const index = DENOMINATION_OPTIONS.indexOf(currentDenom)
  if (index === -1) return DENOMINATION_OPTIONS[0]
  return DENOMINATION_OPTIONS[(index + 1) % DENOMINATION_OPTIONS.length]
}

/**
 * Check if a denomination is valid
 */
export const isValidDenomination = (denom: number): boolean => {
  return DENOMINATION_OPTIONS.includes(denom)
}

/**
 * Get the next language in the cycle
 */
export const getNextLanguage = (currentLang: Language): Language => {
  const index = LANGUAGES.indexOf(currentLang)
  if (index === -1) return LANGUAGES[0] as Language
  return LANGUAGES[(index + 1) % LANGUAGES.length] as Language
}

/**
 * Toggle between two languages
 */
export const toggleLanguage = (currentLang: Language): Language => {
  return currentLang === 'en' ? 'mk' : 'en'
}

/**
 * Keyboard key bindings for game controls
 * Configurable via gameConfig.json
 */
export const KEY_BINDINGS = {
  /** Cycle through bet options */
  CYCLE_BET: GAME_CONFIG.keyBindings.cycleBet,

  /** Set to maximum bet */
  MAX_BET: GAME_CONFIG.keyBindings.maxBet,

  /** Cycle through denomination options */
  CYCLE_DENOMINATION: GAME_CONFIG.keyBindings.cycleDenomination,

  /** Toggle language (EN/MK) */
  TOGGLE_LANGUAGE: GAME_CONFIG.keyBindings.toggleLanguage,

  /** Choose red in gamble mode */
  GAMBLE_RED: GAME_CONFIG.keyBindings.gambleRed,

  /** Choose black in gamble mode */
  GAMBLE_BLACK: GAME_CONFIG.keyBindings.gambleBlack,

  /** Collect winnings in gamble mode */
  GAMBLE_COLLECT: GAME_CONFIG.keyBindings.gambleCollect,

  /** Enter gamble mode (when there's a pending win) */
  ENTER_GAMBLE: GAME_CONFIG.keyBindings.enterGamble as string[],

  /** Spin the reels */
  SPIN: GAME_CONFIG.keyBindings.spin,
} as const

export type KeyBinding = keyof typeof KEY_BINDINGS

export default GAME_CONFIG
