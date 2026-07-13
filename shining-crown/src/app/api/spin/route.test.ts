import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { NextRequest } from 'next/server'

import { POST } from './route'
import { readTransactionLog } from '../../../utils/transactionLogger'

const originalCwd = process.cwd()
let fixtureDir: string

function spinRequest(body: unknown): NextRequest {
  return new Request('http://localhost/api/spin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }) as unknown as NextRequest
}

beforeEach(() => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spin-route-'))
  const dataDir = path.join(fixtureDir, 'src', 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(path.join(dataDir, 'wallet.json'), JSON.stringify({
    schemaVersion: 2,
    unit: 'deni',
    balance: 100000,
    currency: 'MKD',
    lastUpdated: new Date().toISOString()
  }))

  const assetsDir = path.join(fixtureDir, 'public', 'assets')
  fs.mkdirSync(assetsDir, { recursive: true })
  for (const asset of ['virtual_reels_revamped.json', 'symbolMapping.json']) {
    fs.copyFileSync(
      path.join(originalCwd, 'public', 'assets', asset),
      path.join(assetsDir, asset)
    )
  }

  process.chdir(fixtureDir)
})

afterEach(() => {
  process.chdir(originalCwd)
  fs.rmSync(fixtureDir, { recursive: true, force: true })
})

describe('POST /api/spin', () => {
  it('rejects bets that are not in the configured bet list', async () => {
    for (const bet of [5, 501, -500, 1.5]) {
      const response = await POST(spinRequest({ bet }))
      expect(response.status).toBe(400)
    }
  })

  it('deducts the bet in deni and journals it as spin_bet (and wins as spin_win)', async () => {
    const response = await POST(spinRequest({ bet: 500 }))
    expect(response.status).toBe(200)
    const payload = await response.json()

    expect(payload.success).toBe(true)
    expect(Number.isInteger(payload.totalWin)).toBe(true)
    expect(payload.balance).toBe(100000 - 500 + payload.totalWin)

    const transactions = readTransactionLog().transactions
    const bet = transactions.find(t => t.type === 'spin_bet')
    expect(bet).toBeDefined()
    expect(bet!.amount).toBe(-500)

    if (payload.totalWin > 0) {
      const win = transactions.find(t => t.type === 'spin_win')
      expect(win).toBeDefined()
      expect(win!.amount).toBe(payload.totalWin)
    } else {
      expect(transactions.some(t => t.type === 'spin_win')).toBe(false)
    }
  })

  it('rejects a bet exceeding the balance', async () => {
    fs.writeFileSync(path.join(fixtureDir, 'src', 'data', 'wallet.json'), JSON.stringify({
      schemaVersion: 2,
      unit: 'deni',
      balance: 400,
      currency: 'MKD',
      lastUpdated: new Date().toISOString()
    }))
    const response = await POST(spinRequest({ bet: 500 }))
    expect(response.status).toBe(400)
    const payload = await response.json()
    expect(payload.error).toMatch(/insufficient/i)
  })
})
