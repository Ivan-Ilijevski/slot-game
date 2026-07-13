import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

import { POST } from './route'
import { readWallet } from '../../../../utils/wallet'
import { readTransactionLog } from '../../../../utils/transactionLogger'
import { readMeters } from '../../../../utils/meters'

const originalCwd = process.cwd()
let fixtureDir: string
const fetchMock = vi.fn()

function redeemRequest(body: unknown): NextRequest {
  return new Request('http://localhost/api/voucher/redeem', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }) as unknown as NextRequest
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  process.env.VOUCHER_SERVER_URL = 'http://voucher.test'

  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voucher-redeem-'))
  const dataDir = path.join(fixtureDir, 'src', 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(path.join(dataDir, 'wallet.json'), JSON.stringify({
    schemaVersion: 2,
    unit: 'deni',
    balance: 10000,
    currency: 'MKD',
    lastUpdated: new Date().toISOString()
  }))
  process.chdir(fixtureDir)
})

afterEach(() => {
  vi.unstubAllGlobals()
  process.chdir(originalCwd)
  fs.rmSync(fixtureDir, { recursive: true, force: true })
})

describe('POST /api/voucher/redeem', () => {
  it('validates against the voucher server and credits the wallet atomically', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ valid: true, credit: 25 }), { status: 200 }))

    const response = await POST(redeemRequest({ id: '123456789012345678' }))
    const payload = await response.json()

    expect(payload.success).toBe(true)
    expect(payload.credit).toBe(2500) // deni (voucher server speaks denars)
    expect(payload.balance).toBe(12500)
    expect(readWallet().balance).toBe(12500)
    expect(readMeters().meters.voucherIn).toBe(2500)

    const txn = readTransactionLog().transactions.find(t => t.type === 'credit_add')
    expect(txn).toBeDefined()
    expect(txn!.amount).toBe(2500)
    expect(txn!.metadata?.voucherId).toBe('123456789012345678')
  })

  it('does not credit when the voucher is invalid', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ valid: false, reason: 'Already redeemed' }), { status: 409 }))

    const response = await POST(redeemRequest({ id: '123456789012345678' }))
    expect(response.status).toBe(409)
    expect(readWallet().balance).toBe(10000)
    expect(readMeters().meters.voucherIn).toBe(0)
  })

  it('does not credit when the voucher server is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))

    const response = await POST(redeemRequest({ id: '123456789012345678' }))
    expect(response.status).toBe(502)
    expect(readWallet().balance).toBe(10000)
  })

  it('rejects malformed voucher ids without calling the server', async () => {
    const response = await POST(redeemRequest({ id: 'not-a-voucher!' }))
    expect(response.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
