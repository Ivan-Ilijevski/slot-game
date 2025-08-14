// Currency utilities for slot games
import { formatCurrency, CURRENCY_CONFIG } from '../../config/currency'

export interface CurrencyUtilsConfig {
  currency: string
  symbol: string
  position: 'before' | 'after'
}

export class CurrencyUtils {
  private config: CurrencyUtilsConfig

  constructor(config?: Partial<CurrencyUtilsConfig>) {
    this.config = {
      currency: config?.currency || CURRENCY_CONFIG.currency,
      symbol: config?.symbol || CURRENCY_CONFIG.symbol,
      position: config?.position || (CURRENCY_CONFIG.position as 'before' | 'after')
    }
  }

  // Format currency amount based on config
  formatCurrency(amount: number): string {
    const formatted = amount.toFixed(2)
    return this.config.position === 'before' 
      ? `${this.config.symbol}${formatted}`
      : `${formatted}${this.config.symbol}`
  }

  // Format numbers with spaces instead of commas for credit display
  formatNumberWithSpaces(num: number): string {
    return num.toLocaleString().replace(/,/g, ' ')
  }

  // Convert currency to credits based on denomination
  currencyToCredits(amount: number, denomination: number): number {
    return Math.round(amount / denomination)
  }

  // Convert credits to currency based on denomination
  creditsToCurrency(credits: number, denomination: number): number {
    return credits * denomination
  }

  // Format currency with credits display (e.g., "$5.00 (500)")
  formatCurrencyWithCredits(amount: number, denomination: number): string {
    const currencyFormatted = this.formatCurrency(amount)
    const credits = this.currencyToCredits(amount, denomination)
    const creditsFormatted = this.formatNumberWithSpaces(credits)
    return `${currencyFormatted} (${creditsFormatted})`
  }

  // Validate bet amount against available balance
  isValidBet(betAmount: number, balance: number): boolean {
    return betAmount > 0 && betAmount <= balance
  }

  // Get next higher bet from options array
  getNextBet(currentBet: number, betOptions: number[]): number {
    const currentIndex = betOptions.indexOf(currentBet)
    if (currentIndex === -1 || currentIndex === betOptions.length - 1) {
      return betOptions[0] // Cycle to first option
    }
    return betOptions[currentIndex + 1]
  }

  // Get previous bet from options array
  getPreviousBet(currentBet: number, betOptions: number[]): number {
    const currentIndex = betOptions.indexOf(currentBet)
    if (currentIndex === -1 || currentIndex === 0) {
      return betOptions[betOptions.length - 1] // Cycle to last option
    }
    return betOptions[currentIndex - 1]
  }

  // Get maximum bet that player can afford
  getMaxAffordableBet(balance: number, betOptions: number[]): number {
    const affordableBets = betOptions.filter(bet => bet <= balance)
    return affordableBets.length > 0 ? Math.max(...affordableBets) : betOptions[0]
  }

  // Calculate win percentage for display
  calculateWinPercentage(winAmount: number, betAmount: number): number {
    return betAmount > 0 ? Math.round((winAmount / betAmount) * 100) : 0
  }

  // Format win multiplier (e.g., "5x", "10x")
  formatWinMultiplier(winAmount: number, betAmount: number): string {
    if (betAmount === 0) return '0x'
    const multiplier = Math.round(winAmount / betAmount)
    return `${multiplier}x`
  }
}

// Default currency utils instance using the app's currency config
export const currencyUtils = new CurrencyUtils()

// Export the original formatCurrency for backward compatibility
export { formatCurrency }

// Convenience functions that use the default instance
export const formatNumberWithSpaces = (num: number): string => {
  return currencyUtils.formatNumberWithSpaces(num)
}

export const currencyToCredits = (amount: number, denomination: number): number => {
  return currencyUtils.currencyToCredits(amount, denomination)
}

export const creditsToCurrency = (credits: number, denomination: number): number => {
  return currencyUtils.creditsToCurrency(credits, denomination)
}

export const formatCurrencyWithCredits = (amount: number, denomination: number): string => {
  return currencyUtils.formatCurrencyWithCredits(amount, denomination)
}

export const isValidBet = (betAmount: number, balance: number): boolean => {
  return currencyUtils.isValidBet(betAmount, balance)
}

export const getNextBet = (currentBet: number, betOptions: number[]): number => {
  return currencyUtils.getNextBet(currentBet, betOptions)
}

export const getPreviousBet = (currentBet: number, betOptions: number[]): number => {
  return currencyUtils.getPreviousBet(currentBet, betOptions)
}

export const getMaxAffordableBet = (balance: number, betOptions: number[]): number => {
  return currencyUtils.getMaxAffordableBet(balance, betOptions)
}