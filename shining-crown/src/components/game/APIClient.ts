// API client for slot game backend communication
export interface WalletResponse {
  success: boolean
  balance: number
  currency?: string
  lastUpdated?: string
  operation?: 'add' | 'deduct'
  amount?: number
  error?: string
}

export interface SpinResult {
  reel: number
  position: number
  symbols: string[]
}

export interface WinLine {
  payline: number
  symbols: string[]
  count: number
  symbol: string
  payout: number
}

export interface SpinResponse {
  success: boolean
  results: SpinResult[]
  winLines: WinLine[]
  totalWin: number
  expandedReels: number[]
  balance: number
  timestamp: number
  error?: string
  currentBalance?: number
  requiredAmount?: number
}

export type WalletOperation = 'add' | 'deduct'

export class APIClient {
  private baseURL: string

  constructor(baseURL: string = '/api') {
    this.baseURL = baseURL
  }

  // Get current wallet balance
  async getWalletBalance(): Promise<WalletResponse> {
    try {
      const response = await fetch(`${this.baseURL}/wallet`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`)
      }

      return data
    } catch (error) {
      console.error('Failed to get wallet balance:', error)
      return {
        success: false,
        balance: 0,
        error: error instanceof Error ? error.message : 'Failed to get wallet balance'
      }
    }
  }

  // Update wallet balance
  async updateWalletBalance(amount: number, operation: WalletOperation): Promise<WalletResponse> {
    try {
      if (amount <= 0) {
        throw new Error('Amount must be positive')
      }

      const response = await fetch(`${this.baseURL}/wallet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount, operation }),
      })

      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`)
      }

      return data
    } catch (error) {
      console.error('Failed to update wallet balance:', error)
      return {
        success: false,
        balance: 0,
        error: error instanceof Error ? error.message : 'Failed to update wallet balance'
      }
    }
  }

  // Add money to wallet
  async addToWallet(amount: number): Promise<WalletResponse> {
    return this.updateWalletBalance(amount, 'add')
  }

  // Deduct money from wallet
  async deductFromWallet(amount: number): Promise<WalletResponse> {
    return this.updateWalletBalance(amount, 'deduct')
  }

  // Perform a spin
  async spin(betAmount: number): Promise<SpinResponse> {
    try {
      if (betAmount <= 0) {
        throw new Error('Bet amount must be positive')
      }

      const response = await fetch(`${this.baseURL}/spin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ bet: betAmount }),
      })

      const data = await response.json()
      
      if (!response.ok) {
        // Handle specific error cases
        if (response.status === 400 && data.error === 'Insufficient funds') {
          return {
            success: false,
            results: [],
            winLines: [],
            totalWin: 0,
            expandedReels: [],
            balance: data.currentBalance || 0,
            timestamp: Date.now(),
            error: 'Insufficient funds',
            currentBalance: data.currentBalance,
            requiredAmount: data.requiredAmount
          }
        }
        
        throw new Error(data.error || `HTTP error! status: ${response.status}`)
      }

      return data
    } catch (error) {
      console.error('Failed to perform spin:', error)
      return {
        success: false,
        results: [],
        winLines: [],
        totalWin: 0,
        expandedReels: [],
        balance: 0,
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : 'Failed to perform spin'
      }
    }
  }

  // Check API health
  async checkHealth(): Promise<{ status: string; message?: string }> {
    try {
      const response = await fetch(`${this.baseURL}/spin`, {
        method: 'GET',
      })

      if (response.ok) {
        const data = await response.json()
        return { status: 'active', message: data.message }
      } else {
        return { status: 'error', message: `HTTP ${response.status}` }
      }
    } catch (error) {
      console.error('API health check failed:', error)
      return { 
        status: 'error', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      }
    }
  }

  // Validate bet amount against current balance
  async validateBet(betAmount: number): Promise<{ valid: boolean; balance?: number; error?: string }> {
    try {
      const walletResponse = await this.getWalletBalance()
      
      if (!walletResponse.success) {
        return { valid: false, error: walletResponse.error }
      }

      const valid = betAmount > 0 && betAmount <= walletResponse.balance
      return { 
        valid, 
        balance: walletResponse.balance,
        error: !valid ? (betAmount <= 0 ? 'Invalid bet amount' : 'Insufficient funds') : undefined
      }
    } catch (error) {
      console.error('Failed to validate bet:', error)
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : 'Failed to validate bet' 
      }
    }
  }
}

// React hook for using APIClient
export function useAPIClient(baseURL?: string) {
  const apiClient = new APIClient(baseURL)

  return {
    // Wallet operations
    getWalletBalance: () => apiClient.getWalletBalance(),
    updateWalletBalance: (amount: number, operation: WalletOperation) => 
      apiClient.updateWalletBalance(amount, operation),
    addToWallet: (amount: number) => apiClient.addToWallet(amount),
    deductFromWallet: (amount: number) => apiClient.deductFromWallet(amount),
    
    // Game operations
    spin: (betAmount: number) => apiClient.spin(betAmount),
    validateBet: (betAmount: number) => apiClient.validateBet(betAmount),
    
    // System operations
    checkHealth: () => apiClient.checkHealth(),
  }
}

// Default API client instance
export const apiClient = new APIClient()

// Convenience functions using the default instance
export const getWalletBalance = (): Promise<WalletResponse> => apiClient.getWalletBalance()
export const addToWallet = (amount: number): Promise<WalletResponse> => apiClient.addToWallet(amount)
export const deductFromWallet = (amount: number): Promise<WalletResponse> => apiClient.deductFromWallet(amount)
export const spin = (betAmount: number): Promise<SpinResponse> => apiClient.spin(betAmount)
export const validateBet = (betAmount: number) => apiClient.validateBet(betAmount)
export const checkAPIHealth = () => apiClient.checkHealth()

// Error handling utilities
export function isInsufficientFundsError(response: SpinResponse | WalletResponse): boolean {
  return !response.success && response.error === 'Insufficient funds'
}

export function getErrorMessage(response: SpinResponse | WalletResponse): string {
  return response.error || 'An unknown error occurred'
}

// Response type guards
export function isWalletResponse(response: unknown): response is WalletResponse {
  return !!(response && 
    typeof response === 'object' && 
    response !== null &&
    'balance' in response && 
    'success' in response && 
    typeof (response as WalletResponse).balance === 'number' && 
    typeof (response as WalletResponse).success === 'boolean')
}

export function isSpinResponse(response: unknown): response is SpinResponse {
  return !!(response && 
    typeof response === 'object' && 
    response !== null &&
    'results' in response && 
    'success' in response && 
    Array.isArray((response as SpinResponse).results) && 
    typeof (response as SpinResponse).success === 'boolean')
}