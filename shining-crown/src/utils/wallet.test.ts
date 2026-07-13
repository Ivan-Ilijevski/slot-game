import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  addBalance,
  deductBalance,
  enqueueMoneyOp,
  getBalance,
  readWallet,
  updateBalance,
  validateBalance
} from './wallet'

const originalCwd = process.cwd()
let fixtureDir: string

function dataDir(): string {
  return path.join(fixtureDir, 'src', 'data')
}

function seedWalletFile(contents: object): void {
  fs.mkdirSync(dataDir(), { recursive: true })
  fs.writeFileSync(path.join(dataDir(), 'wallet.json'), JSON.stringify(contents, null, 2))
}

beforeEach(() => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wallet-'))
  process.chdir(fixtureDir)
})

afterEach(() => {
  process.chdir(originalCwd)
  fs.rmSync(fixtureDir, { recursive: true, force: true })
})

describe('wallet v2 migration', () => {
  it('migrates a legacy whole-MKD wallet to deni (x100) with a backup', () => {
    seedWalletFile({ balance: 660121, currency: 'MKD', lastUpdated: new Date().toISOString() })

    const wallet = readWallet()

    expect(wallet.schemaVersion).toBe(2)
    expect(wallet.unit).toBe('deni')
    expect(wallet.balance).toBe(66012100)

    const backupPath = path.join(dataDir(), 'wallet.mkd-legacy.bak.json')
    expect(fs.existsSync(backupPath)).toBe(true)
    expect(JSON.parse(fs.readFileSync(backupPath, 'utf8')).balance).toBe(660121)
  })

  it('is idempotent: a second read does not multiply again', () => {
    seedWalletFile({ balance: 100, currency: 'MKD', lastUpdated: new Date().toISOString() })
    expect(readWallet().balance).toBe(10000)
    expect(readWallet().balance).toBe(10000)
  })

  it('rounds fractional legacy balances to whole deni', () => {
    seedWalletFile({ balance: 100.505, currency: 'MKD', lastUpdated: new Date().toISOString() })
    expect(readWallet().balance).toBe(10051)
  })

  it('creates a v2 wallet when no file exists', () => {
    const wallet = readWallet()
    expect(wallet.schemaVersion).toBe(2)
    expect(wallet.unit).toBe('deni')
    expect(Number.isInteger(wallet.balance)).toBe(true)
  })

  it('throws on a corrupted wallet file instead of resetting the balance', async () => {
    fs.mkdirSync(dataDir(), { recursive: true })
    const walletPath = path.join(dataDir(), 'wallet.json')
    fs.writeFileSync(walletPath, '{not json')

    expect(() => readWallet()).toThrow()
    await expect(addBalance(100, 'credit_add')).rejects.toThrow()
    expect(fs.readFileSync(walletPath, 'utf8')).toBe('{not json')
  })
})

describe('wallet mutations', () => {
  beforeEach(() => {
    seedWalletFile({
      schemaVersion: 2,
      unit: 'deni',
      balance: 10000,
      currency: 'MKD',
      lastUpdated: new Date().toISOString()
    })
  })

  it('adds and deducts integer deni amounts', async () => {
    await addBalance(521, 'credit_add')
    expect(getBalance()).toBe(10521)
    await deductBalance(21, 'cashout')
    expect(getBalance()).toBe(10500)
  })

  it('rejects non-integer amounts', async () => {
    await expect(updateBalance(1.5)).rejects.toThrow(/integer/i)
    await expect(addBalance(0.01)).rejects.toThrow(/integer/i)
    expect(getBalance()).toBe(10000)
  })

  it('rejects deductions below zero', async () => {
    await expect(deductBalance(10001)).rejects.toThrow(/insufficient/i)
    expect(getBalance()).toBe(10000)
  })

  it('validateBalance reflects the current balance', () => {
    expect(validateBalance(10000)).toBe(true)
    expect(validateBalance(10001)).toBe(false)
  })

  it('serializes compound money ops so interleaved read-modify-write cannot lose updates', async () => {
    // Each op reads the balance, yields the event loop, then writes. Without a
    // shared queue the two writes would race and one increment would be lost.
    const bumpAfterYield = () =>
      enqueueMoneyOp(async () => {
        const before = getBalance()
        await new Promise(resolve => setTimeout(resolve, 5))
        fs.writeFileSync(
          path.join(dataDir(), 'wallet.json'),
          JSON.stringify({
            schemaVersion: 2,
            unit: 'deni',
            balance: before + 100,
            currency: 'MKD',
            lastUpdated: new Date().toISOString()
          })
        )
      })

    await Promise.all([bumpAfterYield(), bumpAfterYield(), addBalance(100, 'credit_add')])
    expect(getBalance()).toBe(10300)
  })

  it('keeps serialization across module copies (globalThis-backed queue)', async () => {
    const globalKey = Symbol.for('shining-crown.moneyQueue')
    expect((globalThis as Record<symbol, unknown>)[globalKey]).toBeDefined()
  })
})
