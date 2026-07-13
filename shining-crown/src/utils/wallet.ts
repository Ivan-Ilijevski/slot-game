import fs from 'fs'
import path from 'path'
import { logTransaction, TransactionType } from './transactionLogger'

// Wallet data structure (schema v2: balance is integer deni, 1 MKD = 100 deni)
export interface WalletData {
  schemaVersion: 2
  unit: 'deni'
  balance: number
  currency: string
  lastUpdated: string
}

const DEFAULT_BALANCE_DENI = 10000 // 100.00 MKD

// All money mutations run through one globalThis-backed queue. Module-level
// state would not serialize across Next's separate route/instrumentation
// bundles, which each get their own copy of this module.
const MONEY_QUEUE_KEY = Symbol.for('shining-crown.moneyQueue')

type GlobalWithQueue = typeof globalThis & { [MONEY_QUEUE_KEY]?: Promise<unknown> }

function getQueue(): Promise<unknown> {
  const g = globalThis as GlobalWithQueue
  if (!g[MONEY_QUEUE_KEY]) {
    g[MONEY_QUEUE_KEY] = Promise.resolve()
  }
  return g[MONEY_QUEUE_KEY]
}

// Serialize an operation against all other money operations. Compound
// operations (wallet + meters + AFT state) should run their whole critical
// section inside one enqueueMoneyOp call, using the *Sync functions inside it.
// Never call the public async wallet functions from inside an enqueued op —
// they enqueue themselves and would deadlock.
export function enqueueMoneyOp<T>(operation: () => T | Promise<T>): Promise<T> {
  const g = globalThis as GlobalWithQueue
  const result = getQueue().then(operation, operation)
  g[MONEY_QUEUE_KEY] = result.then(() => undefined, () => undefined)
  return result
}

// Get the wallet file path
function getWalletPath(): string {
  return path.join(process.cwd(), 'src', 'data', 'wallet.json')
}

function defaultWallet(): WalletData {
  return {
    schemaVersion: 2,
    unit: 'deni',
    balance: DEFAULT_BALANCE_DENI,
    currency: 'MKD',
    lastUpdated: new Date().toISOString()
  }
}

// Read wallet data from JSON file, migrating legacy whole-MKD wallets to deni.
export function readWallet(): WalletData {
  try {
    const walletPath = getWalletPath()

    if (!fs.existsSync(walletPath)) {
      const wallet = defaultWallet()
      writeWallet(wallet)
      return wallet
    }

    const raw = JSON.parse(fs.readFileSync(walletPath, 'utf8'))

    if (typeof raw.balance !== 'number' || raw.balance < 0) {
      throw new Error('Invalid wallet balance')
    }

    if (raw.schemaVersion !== 2) {
      // Legacy v1 wallet stored whole MKD. Back it up, then convert to deni.
      const backupPath = path.join(path.dirname(walletPath), 'wallet.mkd-legacy.bak.json')
      fs.copyFileSync(walletPath, backupPath)
      const migrated: WalletData = {
        schemaVersion: 2,
        unit: 'deni',
        balance: Math.round(raw.balance * 100),
        currency: raw.currency || 'MKD',
        lastUpdated: new Date().toISOString()
      }
      writeWallet(migrated)
      console.log(`Wallet migrated to deni: ${raw.balance} MKD -> ${migrated.balance} deni (backup: ${backupPath})`)
      return migrated
    }

    return raw as WalletData
  } catch (error) {
    // Never fall back to a default wallet here: writing on top of an
    // unreadable file would silently reset the player's real balance.
    console.error('Error reading wallet:', error)
    throw error
  }
}

// Write wallet data to JSON file
export function writeWallet(walletData: WalletData): void {
  try {
    const walletPath = getWalletPath()

    const dataDir = path.dirname(walletPath)
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }

    const updatedWallet: WalletData = {
      ...walletData,
      schemaVersion: 2,
      unit: 'deni',
      lastUpdated: new Date().toISOString()
    }

    fs.writeFileSync(walletPath, JSON.stringify(updatedWallet, null, 2), 'utf8')
    console.log('Wallet updated:', updatedWallet)
  } catch (error) {
    console.error('Error writing wallet:', error)
    throw new Error('Failed to save wallet data')
  }
}

// Get current balance in deni
export function getBalance(): number {
  return readWallet().balance
}

// Atomic (single-tick) read-modify-write. Safe to call directly only from
// inside an enqueueMoneyOp critical section; external callers use the async
// wrappers below.
export function updateBalanceSync(amount: number, transactionType?: TransactionType, metadata?: Record<string, unknown>): WalletData {
  if (!Number.isInteger(amount)) {
    throw new Error(`Money amounts must be integer deni, got ${amount}`)
  }

  const wallet = readWallet()
  const balanceBefore = wallet.balance
  const newBalance = wallet.balance + amount

  if (newBalance < 0) {
    throw new Error('Insufficient funds')
  }

  writeWallet({ ...wallet, balance: newBalance })

  if (transactionType) {
    try {
      logTransaction(transactionType, amount, balanceBefore, newBalance, metadata)
    } catch (error) {
      console.error('Failed to log transaction:', error)
      // Don't throw error for logging failure - wallet update should proceed
    }
  }

  return { ...wallet, balance: newBalance }
}

// Update balance (positive to add, negative to subtract), serialized with all
// other money operations.
export function updateBalance(amount: number, transactionType?: TransactionType, metadata?: Record<string, unknown>): Promise<WalletData> {
  return enqueueMoneyOp(() => updateBalanceSync(amount, transactionType, metadata))
}

// Validate if there are sufficient funds for a transaction
export function validateBalance(amount: number): boolean {
  return getBalance() >= amount
}

export function deductBalanceSync(amount: number, transactionType: TransactionType = 'adjustment', metadata?: Record<string, unknown>): WalletData {
  if (amount <= 0) {
    throw new Error('Deduction amount must be positive')
  }
  return updateBalanceSync(-amount, transactionType, metadata)
}

// Deduct amount from wallet (throws if insufficient funds)
export function deductBalance(amount: number, transactionType: TransactionType = 'adjustment', metadata?: Record<string, unknown>): Promise<WalletData> {
  return enqueueMoneyOp(() => deductBalanceSync(amount, transactionType, metadata))
}

export function addBalanceSync(amount: number, transactionType: TransactionType = 'credit_add', metadata?: Record<string, unknown>): WalletData {
  if (amount <= 0) {
    throw new Error('Addition amount must be positive')
  }
  return updateBalanceSync(amount, transactionType, metadata)
}

// Add amount to wallet
export function addBalance(amount: number, transactionType: TransactionType = 'credit_add', metadata?: Record<string, unknown>): Promise<WalletData> {
  return enqueueMoneyOp(() => addBalanceSync(amount, transactionType, metadata))
}
