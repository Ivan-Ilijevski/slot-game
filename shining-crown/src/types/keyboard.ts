export interface KeyboardActions {
  // Spinning actions
  spinReels: () => void
  stopReels: () => void
  takeWin: () => void

  // Betting actions
  cycleBet: () => void
  setMaxBet: () => void
  cycleDenomination: () => void

  // Gamble actions
  enterGambleMode: () => void
  chooseGambleColor: (color: 'red' | 'black') => void
  collectGambleWin: () => void

  // Autoplay actions
  toggleAutoStart: () => void

  // Language actions
  toggleLanguage: () => void
}

export interface GameState {
  isSpinning: boolean
  isGambleMode: boolean
  gambleStage: 'choice' | 'reveal' | 'result'
  hasPendingWin: boolean
  isWinAnimating: boolean
  stopRequested: boolean
  hasRunningAnimations: boolean
  isAutoStart?: boolean
}
