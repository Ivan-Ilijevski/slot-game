// Currency configuration for the slot game
export const CURRENCY_CONFIG = {
  currency: 'MKD', // USD, EUR, GBP, etc.
  symbol: ' MKD',     // Currency symbol to display
  position: 'after' // 'before' or 'after' the amount
}

// Format currency amount based on config
export const formatCurrency = (amount: number): string => {
  const formatted = amount.toFixed(2)
  return CURRENCY_CONFIG.position === 'before' 
    ? `${CURRENCY_CONFIG.symbol}${formatted}`
    : `${formatted}${CURRENCY_CONFIG.symbol}`
}