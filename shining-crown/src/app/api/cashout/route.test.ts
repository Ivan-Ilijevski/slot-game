import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const generateVoucher = vi.fn()
vi.mock('../../../utils/voucherGenerator', () => ({
  generateVoucher: (...args: unknown[]) => generateVoucher(...args)
}))
vi.mock('../../../utils/thermalPrinter', () => ({
  printCashoutTicket: vi.fn(async () => ({ success: true })),
  generateTicketId: () => 'TICKET-1',
  getPrinterStatus: vi.fn(async () => ({ connected: true }))
}))
vi.mock('../../../utils/rawPrinter', () => ({
  printCashoutTicketRaw: vi.fn(async () => ({ success: true }))
}))

import { POST } from './route'
import { readWallet } from '../../../utils/wallet'
import { readTransactionLog } from '../../../utils/transactionLogger'

const originalCwd = process.cwd()
let fixtureDir: string

function cashoutRequest(body: unknown): NextRequest {
  return new Request('http://localhost/api/cashout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }) as unknown as NextRequest
}

beforeEach(() => {
  generateVoucher.mockReset()
  generateVoucher.mockResolvedValue({ success: true, id: 'AB1234567890123456' })

  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cashout-route-'))
  const dataDir = path.join(fixtureDir, 'src', 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(path.join(dataDir, 'wallet.json'), JSON.stringify({
    schemaVersion: 2,
    unit: 'deni',
    balance: 52100,
    currency: 'MKD',
    lastUpdated: new Date().toISOString()
  }))
  process.chdir(fixtureDir)
})

afterEach(() => {
  process.chdir(originalCwd)
  fs.rmSync(fixtureDir, { recursive: true, force: true })
})

describe('POST /api/cashout', () => {
  it('debits deni but calls the voucher server in denars', async () => {
    const response = await POST(cashoutRequest({ amount: 52100 }))
    const payload = await response.json()

    expect(payload.success).toBe(true)
    // Voucher server boundary is denars
    expect(generateVoucher).toHaveBeenCalledWith(521)
    // Wallet debit is deni
    expect(readWallet().balance).toBe(0)
    const cashout = readTransactionLog().transactions.find(t => t.type === 'cashout')
    expect(cashout).toBeDefined()
    expect(cashout!.amount).toBe(-52100)
  })

  it('enforces the minimum cashout of 10.00 MKD in deni', async () => {
    const response = await POST(cashoutRequest({ amount: 999 }))
    expect(response.status).toBe(400)
    expect(readWallet().balance).toBe(52100)
  })

  it('rejects non-integer amounts', async () => {
    const response = await POST(cashoutRequest({ amount: 5210.5 }))
    expect(response.status).toBe(400)
    expect(readWallet().balance).toBe(52100)
  })
})
