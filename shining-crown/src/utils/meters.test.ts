import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { incrementMeters, incrementMetersSync, readMeters } from './meters'
import { addBalanceSync, deductBalanceSync, enqueueMoneyOp, getBalance } from './wallet'

const originalCwd = process.cwd()
let fixtureDir: string

beforeEach(() => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meters-'))
  const dataDir = path.join(fixtureDir, 'src', 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(path.join(dataDir, 'wallet.json'), JSON.stringify({
    schemaVersion: 2,
    unit: 'deni',
    balance: 100000,
    currency: 'MKD',
    lastUpdated: new Date().toISOString()
  }))
  process.chdir(fixtureDir)
})

afterEach(() => {
  process.chdir(originalCwd)
  fs.rmSync(fixtureDir, { recursive: true, force: true })
})

describe('meters store', () => {
  it('creates a zeroed v1 meters file on first read', () => {
    const data = readMeters()
    expect(data.schemaVersion).toBe(1)
    expect(data.unit).toBe('deni')
    expect(data.meters).toEqual({
      coinIn: 0,
      coinOut: 0,
      drop: 0,
      jackpot: 0,
      gamesPlayed: 0,
      gamesWon: 0,
      aftIn: 0,
      aftOut: 0,
      voucherIn: 0,
      voucherOut: 0
    })
  })

  it('increments meters monotonically', async () => {
    await incrementMeters({ coinIn: 500, gamesPlayed: 1 })
    await incrementMeters({ coinIn: 500, gamesPlayed: 1, coinOut: 2500, gamesWon: 1 })
    const { meters } = readMeters()
    expect(meters.coinIn).toBe(1000)
    expect(meters.gamesPlayed).toBe(2)
    expect(meters.coinOut).toBe(2500)
    expect(meters.gamesWon).toBe(1)
  })

  it('rejects negative and non-integer deltas', () => {
    expect(() => incrementMetersSync({ coinIn: -1 })).toThrow()
    expect(() => incrementMetersSync({ coinIn: 1.5 })).toThrow()
  })

  it('holds the reconciliation invariant across random money operations', async () => {
    const balanceBefore = getBalance()

    // Simulate the flows the game performs: spins (bet, maybe win), voucher
    // in/out, AFT in/out — each as one atomic money op like the routes do.
    let seed = 42
    const rand = (max: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31
      return seed % max
    }

    for (let i = 0; i < 200; i++) {
      const kind = rand(5)
      await enqueueMoneyOp(() => {
        if (kind === 0) {
          const bet = (rand(10) + 1) * 100
          deductBalanceSync(bet, 'spin_bet')
          incrementMetersSync({ coinIn: bet, gamesPlayed: 1 })
          if (rand(2) === 0) {
            const win = bet * (rand(5) + 1)
            addBalanceSync(win, 'spin_win')
            incrementMetersSync({ coinOut: win, gamesWon: 1 })
          }
        } else if (kind === 1) {
          const amount = (rand(50) + 1) * 100
          addBalanceSync(amount, 'credit_add')
          incrementMetersSync({ voucherIn: amount })
        } else if (kind === 2) {
          const amount = Math.min((rand(20) + 1) * 100, getBalance())
          if (amount > 0) {
            deductBalanceSync(amount, 'cashout')
            incrementMetersSync({ voucherOut: amount })
          }
        } else if (kind === 3) {
          const amount = (rand(30) + 1) * 100
          addBalanceSync(amount, 'aft_in')
          incrementMetersSync({ aftIn: amount })
        } else {
          const amount = Math.min((rand(30) + 1) * 100, getBalance())
          if (amount > 0) {
            deductBalanceSync(amount, 'aft_out')
            incrementMetersSync({ aftOut: amount })
          }
        }
      })
    }

    const { meters } = readMeters()
    const walletDelta = getBalance() - balanceBefore
    expect(walletDelta).toBe(
      (meters.coinOut - meters.coinIn) +
      meters.aftIn - meters.aftOut +
      meters.voucherIn - meters.voucherOut
    )
  })
})
