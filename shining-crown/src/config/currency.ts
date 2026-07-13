// Currency configuration for the slot game
export const CURRENCY_CONFIG = {
  currency: 'MKD', // USD, EUR, GBP, etc.
  symbol: ' MKD',     // Currency symbol to display
  position: 'after' // 'before' or 'after' the amount
}

// Format a deni amount (integer, 100 deni = 1.00 MKD) as denars
export const formatCurrency = (amountDeni: number): string => {
  const formatted = (amountDeni / 100).toFixed(2)
  return CURRENCY_CONFIG.position === 'before'
    ? `${CURRENCY_CONFIG.symbol}${formatted}`
    : `${formatted}${CURRENCY_CONFIG.symbol}`
}