import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../utils/secureRandom', () => ({ secureRandom: vi.fn(() => 0) }))

import {
  GambleStateError,
  chooseColor,
  clearEligibleWin,
  collect,
  getState,
  isSessionActive,
  setEligibleWin,
  startGamble
} from './gambleSession'
import { readWallet } from '../utils/wallet'

const originalCwd = process.cwd()
let fixtureDir: string

beforeEach(() => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamble-session-'))
  const dataDir = path.join(fixtureDir, 'src', 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(path.join(dataDir, 'wallet.json'), JSON.stringify({
    balance: 100,
    currency: 'MKD',
    lastUpdated: new Date().toISOString()
  }))
  process.chdir(fixtureDir)
})

afterEach(() => {
  process.chdir(originalCwd)
  fs.rmSync(fixtureDir, { recursive: true, force: true })
})

describe('gamble session', () => {
  it('requires an eligible win to start', async () => {
    await expect(startGamble()).rejects.toBeInstanceOf(GambleStateError)
  })

  it('consumes eligibility when starting', async () => {
    await setEligibleWin(10, 'spin-1')
    await expect(startGamble()).resolves.toEqual({ amount: 10, toWin: 20 })
    expect(getState()).toEqual({ sessionActive: true, currentAmount: 10, round: 0 })
    await expect(startGamble()).rejects.toBeInstanceOf(GambleStateError)
  })

  it('doubles the current amount and increments the round on a win', async () => {
    await setEligibleWin(10, 'spin-1')
    await startGamble()
    const result = await chooseColor('red')
    expect(result).toMatchObject({ won: true, currentAmount: 20, round: 1 })
    expect(readWallet().balance).toBe(100)
  })

  it('deducts the original stake and closes on a loss', async () => {
    await setEligibleWin(10, 'spin-1')
    await startGamble()
    const result = await chooseColor('black')
    expect(result).toMatchObject({ won: false, currentAmount: 0, balance: 90 })
    expect(isSessionActive()).toBe(false)
  })

  it('pays only the net win and closes on collect', async () => {
    await setEligibleWin(10, 'spin-1')
    await startGamble()
    await chooseColor('red')
    await expect(collect()).resolves.toEqual({ settled: true, netAmount: 10, balance: 110 })
    expect(isSessionActive()).toBe(false)
  })

  it('moves no money when collected before a round', async () => {
    await setEligibleWin(10, 'spin-1')
    await startGamble()
    await expect(collect()).resolves.toEqual({ settled: true, netAmount: 0, balance: 100 })
  })

  it('is idempotent when collected without an active session', async () => {
    await expect(collect()).resolves.toEqual({ settled: false, balance: 100 })
    await expect(collect()).resolves.toEqual({ settled: false, balance: 100 })
  })

  it('force-collects the fifth successful doubling', async () => {
    await setEligibleWin(10, 'spin-1')
    await startGamble()
    for (let round = 1; round < 5; round += 1) {
      await expect(chooseColor('red')).resolves.toMatchObject({ won: true, round })
    }
    await expect(chooseColor('red')).resolves.toMatchObject({
      won: true,
      round: 5,
      currentAmount: 320,
      forceCollected: true,
      balance: 410
    })
    expect(isSessionActive()).toBe(false)
  })

  it('overwrites and clears spin eligibility', async () => {
    await setEligibleWin(10, 'spin-1')
    await setEligibleWin(25, 'spin-2')
    expect(getState()).toEqual({ sessionActive: false, eligibleWin: 25 })
    await clearEligibleWin()
    expect(getState()).toEqual({ sessionActive: false })
  })

  it('reflects active state for spin and cashout guards', async () => {
    expect(isSessionActive()).toBe(false)
    await setEligibleWin(10, 'spin-1')
    await startGamble()
    expect(isSessionActive()).toBe(true)
    await collect()
    expect(isSessionActive()).toBe(false)
  })
})
