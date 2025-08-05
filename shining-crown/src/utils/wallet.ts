import fs from 'fs'
import path from 'path'

// Wallet data structure
export interface WalletData {
  balance: number
  currency: string
  lastUpdated: string
}

// Get the wallet file path
function getWalletPath(): string {
  return path.join(process.cwd(), 'src', 'data', 'wallet.json')
}

// Read wallet data from JSON file
export function readWallet(): WalletData {
  try {
    const walletPath = getWalletPath()
    
    // Check if wallet file exists
    if (!fs.existsSync(walletPath)) {
      // Create default wallet if doesn't exist
      const defaultWallet: WalletData = {
        balance: 100.00,
        currency: 'MKD',
        lastUpdated: new Date().toISOString()
      }
      writeWallet(defaultWallet)
      return defaultWallet
    }
    
    const walletData = fs.readFileSync(walletPath, 'utf8')
    const wallet: WalletData = JSON.parse(walletData)
    
    // Validate wallet data
    if (typeof wallet.balance !== 'number' || wallet.balance < 0) {
      throw new Error('Invalid wallet balance')
    }
    
    return wallet
  } catch (error) {
    console.error('Error reading wallet:', error)
    // Return default wallet on error
    return {
      balance: 100.00,
      currency: 'MKD',
      lastUpdated: new Date().toISOString()
    }
  }
}

// Write wallet data to JSON file
export function writeWallet(walletData: WalletData): void {
  try {
    const walletPath = getWalletPath()
    
    // Ensure data directory exists
    const dataDir = path.dirname(walletPath)
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }
    
    // Update timestamp
    const updatedWallet = {
      ...walletData,
      lastUpdated: new Date().toISOString()
    }
    
    // Write to file with pretty formatting
    fs.writeFileSync(walletPath, JSON.stringify(updatedWallet, null, 2), 'utf8')
    console.log('Wallet updated:', updatedWallet)
  } catch (error) {
    console.error('Error writing wallet:', error)
    throw new Error('Failed to save wallet data')
  }
}

// Get current balance
export function getBalance(): number {
  const wallet = readWallet()
  return wallet.balance
}

// Update balance (positive to add, negative to subtract)
export function updateBalance(amount: number): WalletData {
  const wallet = readWallet()
  const newBalance = wallet.balance + amount
  
  // Prevent negative balance
  if (newBalance < 0) {
    throw new Error('Insufficient funds')
  }
  
  const updatedWallet: WalletData = {
    ...wallet,
    balance: newBalance
  }
  
  writeWallet(updatedWallet)
  return updatedWallet
}

// Validate if there are sufficient funds for a transaction
export function validateBalance(amount: number): boolean {
  const currentBalance = getBalance()
  return currentBalance >= amount
}

// Deduct amount from wallet (throws error if insufficient funds)
export function deductBalance(amount: number): WalletData {
  if (amount <= 0) {
    throw new Error('Deduction amount must be positive')
  }
  
  if (!validateBalance(amount)) {
    throw new Error('Insufficient funds')
  }
  
  return updateBalance(-amount)
}

// Add amount to wallet
export function addBalance(amount: number): WalletData {
  if (amount <= 0) {
    throw new Error('Addition amount must be positive')
  }
  
  return updateBalance(amount)
}