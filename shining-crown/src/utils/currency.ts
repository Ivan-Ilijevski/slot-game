/**
 * Currency Utilities
 *
 * Centralized currency formatting and conversion functions for the slot game.
 * Extracted from page.tsx to promote reusability and maintainability.
 */

import { CURRENCY_CONFIG } from '../config/currency'

/**
 * Format a number with spaces instead of commas for better readability
 * @param num - The number to format
 * @returns Formatted string with spaces as thousands separators
 * @example formatNumberWithSpaces(1000) // "1 000"
 * @example formatNumberWithSpaces(1234567) // "1 234 567"
 */
export const formatNumberWithSpaces = (num: number): string => {
  return num.toLocaleString().replace(/,/g, ' ')
}

/**
 * Convert currency amount to credits based on denomination
 * @param amount - The currency amount
 * @param denomination - The denomination value (e.g., 0.01, 0.10, 1.00)
 * @returns Number of credits
 * @example currencyToCredits(100, 0.01) // 10000 credits
 * @example currencyToCredits(50, 1.00) // 50 credits
 */
export const currencyToCredits = (amount: number, denomination: number): number => {
  return Math.round(amount / denomination)
}

/**
 * Convert credits to currency amount based on denomination
 * @param credits - The number of credits
 * @param denomination - The denomination value (e.g., 0.01, 0.10, 1.00)
 * @returns Currency amount
 * @example creditsToCurrency(10000, 0.01) // 100.00
 * @example creditsToCurrency(50, 1.00) // 50.00
 */
export const creditsToCurrency = (credits: number, denomination: number): number => {
  return credits * denomination
}

/**
 * Format currency amount with the configured currency symbol
 * @param amount - The amount to format
 * @returns Formatted currency string
 * @example formatCurrency(100.50) // "100.50 MKD"
 */
export const formatCurrency = (amount: number): string => {
  const formatted = amount.toFixed(2)
  return CURRENCY_CONFIG.position === 'before'
    ? `${CURRENCY_CONFIG.symbol}${formatted}`
    : `${formatted}${CURRENCY_CONFIG.symbol}`
}

/**
 * Format currency with spaces for credits display
 * @param amount - The currency amount
 * @returns Formatted string with spaces
 * @example formatCurrencyWithSpaces(1000.50) // "1 000.50 MKD"
 */
export const formatCurrencyWithSpaces = (amount: number): string => {
  const formatted = amount.toFixed(2)
  const withSpaces = formatted.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return CURRENCY_CONFIG.position === 'before'
    ? `${CURRENCY_CONFIG.symbol}${withSpaces}`
    : `${withSpaces}${CURRENCY_CONFIG.symbol}`
}

/**
 * Format credits display with denomination-based formatting
 * @param amount - The currency amount
 * @param denomination - The denomination value
 * @returns Formatted credits string with spaces
 * @example formatCreditsDisplay(100, 0.01) // "10 000"
 * @example formatCreditsDisplay(50, 1.00) // "50"
 */
export const formatCreditsDisplay = (amount: number, denomination: number): string => {
  const credits = currencyToCredits(amount, denomination)
  return formatNumberWithSpaces(credits)
}

/**
 * Validate if amount is a valid currency value
 * @param amount - The amount to validate
 * @returns True if valid, false otherwise
 */
export const isValidCurrencyAmount = (amount: number): boolean => {
  return typeof amount === 'number' &&
         !isNaN(amount) &&
         isFinite(amount) &&
         amount >= 0
}

/**
 * Round currency amount to 2 decimal places
 * @param amount - The amount to round
 * @returns Rounded amount
 */
export const roundCurrency = (amount: number): number => {
  return Math.round(amount * 100) / 100
}

/**
 * Calculate win multiplier
 * @param winAmount - The win amount
 * @param betAmount - The bet amount
 * @returns Win multiplier (e.g., 10x, 50x)
 */
export const calculateWinMultiplier = (winAmount: number, betAmount: number): number => {
  return betAmount > 0 ? Math.round(winAmount / betAmount) : 0
}

/**
 * Format win multiplier for display
 * @param winAmount - The win amount
 * @param betAmount - The bet amount
 * @returns Formatted multiplier string
 * @example formatWinMultiplier(100, 10) // "10x"
 */
export const formatWinMultiplier = (winAmount: number, betAmount: number): string => {
  const multiplier = calculateWinMultiplier(winAmount, betAmount)
  return `${multiplier}x`
}

/**
 * Get currency configuration
 * @returns Current currency configuration
 */
export const getCurrencyConfig = () => CURRENCY_CONFIG

/**
 * Currency utilities as a single export object for convenience
 */
export const CurrencyUtils = {
  formatNumberWithSpaces,
  currencyToCredits,
  creditsToCurrency,
  formatCurrency,
  formatCurrencyWithSpaces,
  formatCreditsDisplay,
  isValidCurrencyAmount,
  roundCurrency,
  calculateWinMultiplier,
  formatWinMultiplier,
  getCurrencyConfig
}

export default CurrencyUtils
