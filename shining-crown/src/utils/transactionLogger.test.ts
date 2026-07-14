import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { hasTransactionWithSasTxnId, logTransaction, readTransactionLog } from './transactionLogger'

const originalCwd = process.cwd()
let fixtureDir: string

function dataDir(): string {
  return path.join(fixtureDir, 'src', 'data')
}

beforeEach(() => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'txnlog-'))
  fs.mkdirSync(dataDir(), { recursive: true })
  process.chdir(fixtureDir)
})

afterEach(() => {
  process.chdir(originalCwd)
  fs.rmSync(fixtureDir, { recursive: true, force: true })
})

describe('transaction log v2', () => {
  it('archives a legacy MKD journal and starts a fresh deni journal', () => {
    const legacy = {
      transactions: [
        { id: 'a', type: 'spin_bet', amount: -5, balanceBefore: 100, balanceAfter: 95, timestamp: new Date().toISOString() }
      ],
      lastUpdated: new Date().toISOString(),
      totalTransactions: 1
    }
    fs.writeFileSync(path.join(dataDir(), 'transactions.json'), JSON.stringify(legacy))

    const log = readTransactionLog()

    expect(log.schemaVersion).toBe(2)
    expect(log.unit).toBe('deni')
    expect(log.transactions).toEqual([])

    const archivePath = path.join(dataDir(), 'transactions.mkd-legacy.json')
    expect(fs.existsSync(archivePath)).toBe(true)
    expect(JSON.parse(fs.readFileSync(archivePath, 'utf8')).transactions).toHaveLength(1)
  })

  it('creates a v2 journal from scratch and logs deni amounts', () => {
    const txn = logTransaction('spin_bet', -500, 10000, 9500, { spinId: 's1' })

    expect(txn.amount).toBe(-500)
    const log = readTransactionLog()
    expect(log.schemaVersion).toBe(2)
    expect(log.unit).toBe('deni')
    expect(log.transactions).toHaveLength(1)
    expect(log.transactions[0].type).toBe('spin_bet')
  })

  it('accepts aft transaction types with a sasTxnId join key', () => {
    logTransaction('aft_in', 2500, 0, 2500, { sasTxnId: 'TXN-0001' })
    const log = readTransactionLog()
    expect(log.transactions[0].type).toBe('aft_in')
    expect(log.transactions[0].metadata?.sasTxnId).toBe('TXN-0001')
  })

  it('finds a transaction by its SAS txn id (AFT recovery join)', () => {
    logTransaction('spin_bet', -500, 10000, 9500, { spinId: 's1' })
    logTransaction('aft_in', 2500, 9500, 12000, { sasTxnId: 'TXN-0042' })
    expect(hasTransactionWithSasTxnId('TXN-0042')).toBe(true)
    expect(hasTransactionWithSasTxnId('TXN-9999')).toBe(false)
  })
})
