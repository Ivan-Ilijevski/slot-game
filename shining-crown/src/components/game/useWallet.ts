/**
 * useWallet Hook
 *
 * Manages wallet/balance API interactions.
 * Handles fetching balance and processing cashouts.
 *
 * This is a simple, focused hook that ONLY handles API calls.
 * Win collection, animations, and UI state are handled elsewhere.
 *
 * Extracted from page.tsx (lines 109-171) for reusability.
 */

import { useState, useCallback, useEffect } from 'react'

export interface CashoutOptions {
  /** Amount to cashout */
  amount: number

  /** Whether to use USB printer */
  useUSB?: boolean

  /** Machine identifier for the ticket */
  machineId?: string
}

export interface CashoutResult {
  /** Whether cashout was successful */
  success: boolean

  /** Error message if failed */
  error?: string

  /** Response data from server if successful */
  data?: {
    ticket?: {
      ticketId: string
      amount: number
      timestamp: string
    }
    balance?: {
      previous: number
      current: number
    }
    printer?: {
      status: string
      printed: boolean
    }
  }
}

export interface UseWalletProps {
  /** Initial balance (will be overridden by server fetch) */
  initialBalance?: number

  /** Whether to automatically fetch balance on mount */
  autoFetch?: boolean

  /** Base URL for API (defaults to '/api') */
  apiBaseUrl?: string

  /** Callback fired when balance changes */
  onBalanceChange?: (balance: number) => void

  /** Callback fired when cashout succeeds */
  onCashoutSuccess?: (result: CashoutResult) => void

  /** Callback fired when cashout fails */
  onCashoutError?: (error: string) => void

  /** Whether to log wallet operations to console */
  debug?: boolean
}

export interface UseWalletReturn {
  /** Current wallet balance */
  balance: number

  /** Whether balance is currently being fetched */
  isLoading: boolean

  /** Whether a cashout is in progress */
  isCashingOut: boolean

  /** Error message from last operation */
  error: string | null

  /** Manually refresh balance from server */
  refreshBalance: () => Promise<number | null>

  /** Perform a cashout */
  cashout: (options: CashoutOptions) => Promise<CashoutResult>

  /** Clear any error messages */
  clearError: () => void
}

/**
 * Custom hook for wallet/balance management
 *
 * @example
 * ```typescript
 * const wallet = useWallet({
 *   autoFetch: true,
 *   onBalanceChange: (balance) => console.log('Balance:', balance)
 * })
 *
 * // Display balance
 * <span>{wallet.balance} MKD</span>
 *
 * // Refresh balance
 * await wallet.refreshBalance()
 *
 * // Cashout
 * const result = await wallet.cashout({
 *   amount: 100,
 *   useUSB: true,
 *   machineId: 'MACHINE-001'
 * })
 * ```
 */
export function useWallet({
  initialBalance = 0,
  autoFetch = true,
  apiBaseUrl = '/api',
  onBalanceChange,
  onCashoutSuccess,
  onCashoutError,
  debug = false
}: UseWalletProps = {}): UseWalletReturn {

  const [balance, setBalance] = useState<number>(initialBalance)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [isCashingOut, setIsCashingOut] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Fetch balance from server
   */
  const refreshBalance = useCallback(async (): Promise<number | null> => {
    setIsLoading(true)
    setError(null)

    try {
      if (debug) console.log('[useWallet] Fetching balance from:', `${apiBaseUrl}/wallet`)

      const response = await fetch(`${apiBaseUrl}/wallet`)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      if (data.success && typeof data.balance === 'number') {
        if (debug) console.log('[useWallet] Balance refreshed:', data.balance)
        setBalance(data.balance)
        return data.balance
      } else {
        throw new Error('Invalid response format from wallet API')
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to refresh balance'
      console.error('[useWallet] Refresh failed:', errorMessage)
      setError(errorMessage)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [apiBaseUrl, debug])

  /**
   * Perform cashout operation
   */
  const cashout = useCallback(async ({
    amount,
    useUSB = true,
    machineId = 'SHINING-CROWN-001'
  }: CashoutOptions): Promise<CashoutResult> => {

    // Validation
    if (amount <= 0) {
      const errorMsg = 'Invalid cashout amount: must be greater than 0'
      console.error('[useWallet]', errorMsg)
      setError(errorMsg)
      onCashoutError?.(errorMsg)
      return { success: false, error: errorMsg }
    }

    if (amount > balance) {
      const errorMsg = `Insufficient balance: trying to cashout ${amount}, but balance is ${balance}`
      console.error('[useWallet]', errorMsg)
      setError(errorMsg)
      onCashoutError?.(errorMsg)
      return { success: false, error: errorMsg }
    }

    setIsCashingOut(true)
    setError(null)

    try {
      if (debug) console.log('[useWallet] Processing cashout:', { amount, useUSB, machineId })

      const response = await fetch(`${apiBaseUrl}/cashout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount,
          useUSB,
          machineId
        }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        if (debug) console.log('[useWallet] Cashout successful:', data)

        // Refresh balance from server to ensure accuracy
        await refreshBalance()

        const result: CashoutResult = { success: true, data }
        onCashoutSuccess?.(result)
        return result

      } else {
        const errorMsg = data.error || 'Cashout failed'
        console.error('[useWallet] Cashout failed:', errorMsg)
        setError(errorMsg)
        onCashoutError?.(errorMsg)
        return { success: false, error: errorMsg }
      }

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Network error during cashout'
      console.error('[useWallet] Cashout error:', errorMsg)
      setError(errorMsg)
      onCashoutError?.(errorMsg)
      return { success: false, error: errorMsg }

    } finally {
      setIsCashingOut(false)
    }
  }, [balance, apiBaseUrl, debug, refreshBalance, onCashoutSuccess, onCashoutError])

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  /**
   * Notify parent when balance changes
   */
  useEffect(() => {
    if (onBalanceChange) {
      onBalanceChange(balance)
    }
  }, [balance, onBalanceChange])

  /**
   * Auto-fetch balance on mount if enabled
   */
  useEffect(() => {
    if (autoFetch) {
      if (debug) console.log('[useWallet] Auto-fetching balance on mount')
      refreshBalance()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run once on mount

  return {
    balance,
    isLoading,
    isCashingOut,
    error,
    refreshBalance,
    cashout,
    clearError
  }
}

/**
 * Re-export for convenience
 */
export default useWallet
