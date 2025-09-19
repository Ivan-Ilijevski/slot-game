import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

// Transaction types
export type TransactionType = 
  | 'spin_bet'      // Bet placed for spin
  | 'spin_win'      // Win from spin
  | 'gamble_bet'    // Gamble feature bet
  | 'gamble_win'    // Gamble feature win
  | 'gamble_loss'   // Gamble feature loss
  | 'credit_add'    // Credits added to wallet
  | 'cashout'       // Money withdrawn from wallet
  | 'bonus'         // Bonus credits added
  | 'adjustment'    // Manual balance adjustment

// Transaction record structure
export interface Transaction {
  id: string
  type: TransactionType
  amount: number
  balanceBefore: number
  balanceAfter: number
  timestamp: string
  metadata?: {
    betLevel?: number
    lines?: number
    multiplier?: number
    gameRound?: string
    description?: string
    [key: string]: any
  }
}

// Transaction log structure
export interface TransactionLog {
  transactions: Transaction[]
  lastUpdated: string
  totalTransactions: number
}

// Get the transaction log file path
function getTransactionLogPath(): string {
  return path.join(process.cwd(), 'src', 'data', 'transactions.json')
}

// Read transaction log from JSON file
export function readTransactionLog(): TransactionLog {
  try {
    const logPath = getTransactionLogPath()
    
    // Check if log file exists
    if (!fs.existsSync(logPath)) {
      // Create default log if doesn't exist
      const defaultLog: TransactionLog = {
        transactions: [],
        lastUpdated: new Date().toISOString(),
        totalTransactions: 0
      }
      writeTransactionLog(defaultLog)
      return defaultLog
    }
    
    const logData = fs.readFileSync(logPath, 'utf8')
    const log: TransactionLog = JSON.parse(logData)
    
    // Validate log structure
    if (!Array.isArray(log.transactions)) {
      throw new Error('Invalid transaction log structure')
    }
    
    return log
  } catch (error) {
    console.error('Error reading transaction log:', error)
    // Return empty log on error
    return {
      transactions: [],
      lastUpdated: new Date().toISOString(),
      totalTransactions: 0
    }
  }
}

// Write transaction log to JSON file
export function writeTransactionLog(log: TransactionLog): void {
  try {
    const logPath = getTransactionLogPath()
    
    // Ensure data directory exists
    const dataDir = path.dirname(logPath)
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }
    
    // Update timestamp and total count
    const updatedLog = {
      ...log,
      lastUpdated: new Date().toISOString(),
      totalTransactions: log.transactions.length
    }
    
    // Write to file with pretty formatting
    fs.writeFileSync(logPath, JSON.stringify(updatedLog, null, 2), 'utf8')
  } catch (error) {
    console.error('Error writing transaction log:', error)
    throw new Error('Failed to save transaction log')
  }
}

// Add a new transaction to the log
export function logTransaction(
  type: TransactionType,
  amount: number,
  balanceBefore: number,
  balanceAfter: number,
  metadata?: Transaction['metadata']
): Transaction {
  const transaction: Transaction = {
    id: uuidv4(),
    type,
    amount,
    balanceBefore,
    balanceAfter,
    timestamp: new Date().toISOString(),
    metadata
  }
  
  try {
    const log = readTransactionLog()
    
    // Add new transaction
    log.transactions.push(transaction)
    
    // Keep only last 10000 transactions to prevent file from growing too large
    if (log.transactions.length > 10000) {
      log.transactions = log.transactions.slice(-10000)
    }
    
    writeTransactionLog(log)
    
    console.log('Transaction logged:', {
      id: transaction.id,
      type: transaction.type,
      amount: transaction.amount,
      balance: `${balanceBefore} → ${balanceAfter}`
    })
    
    return transaction
  } catch (error) {
    console.error('Error logging transaction:', error)
    throw new Error('Failed to log transaction')
  }
}

// Get recent transactions (default: last 100)
export function getRecentTransactions(limit: number = 100): Transaction[] {
  try {
    const log = readTransactionLog()
    return log.transactions.slice(-limit).reverse() // Most recent first
  } catch (error) {
    console.error('Error getting recent transactions:', error)
    return []
  }
}

// Get transactions by type
export function getTransactionsByType(type: TransactionType, limit?: number): Transaction[] {
  try {
    const log = readTransactionLog()
    const filtered = log.transactions.filter(t => t.type === type)
    
    if (limit) {
      return filtered.slice(-limit).reverse()
    }
    
    return filtered.reverse()
  } catch (error) {
    console.error('Error getting transactions by type:', error)
    return []
  }
}

// Get transactions within date range
export function getTransactionsByDateRange(
  startDate: Date,
  endDate: Date
): Transaction[] {
  try {
    const log = readTransactionLog()
    
    return log.transactions.filter(t => {
      const transactionDate = new Date(t.timestamp)
      return transactionDate >= startDate && transactionDate <= endDate
    }).reverse()
  } catch (error) {
    console.error('Error getting transactions by date range:', error)
    return []
  }
}

// Get transaction statistics
export function getTransactionStats(): {
  totalTransactions: number
  totalWagered: number
  totalWinnings: number
  totalDeposits: number
  totalWithdrawals: number
  netResult: number
} {
  try {
    const log = readTransactionLog()
    
    let totalWagered = 0
    let totalWinnings = 0
    let totalDeposits = 0
    let totalWithdrawals = 0
    
    log.transactions.forEach(t => {
      switch (t.type) {
        case 'spin_bet':
        case 'gamble_bet':
          totalWagered += Math.abs(t.amount)
          break
        case 'spin_win':
        case 'gamble_win':
        case 'bonus':
          totalWinnings += t.amount
          break
        case 'credit_add':
          totalDeposits += t.amount
          break
        case 'cashout':
          totalWithdrawals += Math.abs(t.amount)
          break
      }
    })
    
    return {
      totalTransactions: log.transactions.length,
      totalWagered,
      totalWinnings,
      totalDeposits,
      totalWithdrawals,
      netResult: totalWinnings - totalWagered + totalDeposits - totalWithdrawals
    }
  } catch (error) {
    console.error('Error calculating transaction stats:', error)
    return {
      totalTransactions: 0,
      totalWagered: 0,
      totalWinnings: 0,
      totalDeposits: 0,
      totalWithdrawals: 0,
      netResult: 0
    }
  }
}

// Clear old transactions (keep only recent ones)
export function clearOldTransactions(keepCount: number = 1000): void {
  try {
    const log = readTransactionLog()
    
    if (log.transactions.length > keepCount) {
      log.transactions = log.transactions.slice(-keepCount)
      writeTransactionLog(log)
      console.log(`Cleared old transactions, keeping last ${keepCount}`)
    }
  } catch (error) {
    console.error('Error clearing old transactions:', error)
    throw new Error('Failed to clear old transactions')
  }
}