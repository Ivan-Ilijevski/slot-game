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

import { PassThrough } from 'stream'
import { POST } from './route'
import { readWallet } from '../../../utils/wallet'
import { readTransactionLog } from '../../../utils/transactionLogger'
import { readMeters } from '../../../utils/meters'
import { __resetSasServiceForTests, startSasService } from '../../../lib/sas/singleton'
import { numberToBcd } from '../../../lib/sas/bcd'
import { crc16Kermit } from '../../../lib/sas/crc16'
import { CH_SAS, muxFrame } from '../../../lib/sas/muxCodec'

const originalCwd = process.cwd()
let fixtureDir: string

function fromEgmFrame(amountCents: number, txn: string): Buffer {
  const parts = [
    Buffer.from([0x00, 0x00, 0x00, 0x80]),
    numberToBcd(amountCents, 5), Buffer.alloc(5), Buffer.alloc(5),
    Buffer.from([0x00]), Buffer.alloc(4), Buffer.alloc(20),
    Buffer.from([txn.length]), Buffer.from(txn, 'ascii'),
    Buffer.alloc(4), Buffer.from([0x00, 0x00]), Buffer.from([0x00]), Buffer.from([0x00, 0x00])
  ]
  const body = Buffer.concat(parts)
  body[0] = body.length - 1
  const frame = Buffer.concat([Buffer.from([0x01, 0x72]), body])
  const crc = crc16Kermit(frame)
  return Buffer.concat([frame, Buffer.from([crc & 0xff, crc >> 8])])
}

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
  __resetSasServiceForTests()
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
    expect(readMeters().meters.voucherOut).toBe(52100)
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

  it('pays the full balance to the card via AFT when the host pulls it (no voucher)', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    startSasService({ testStream: { input, output } })

    // Bring the link up with a general poll so the route offers the card path.
    input.write(muxFrame(CH_SAS, Buffer.from([0x81])))
    await new Promise(resolve => setImmediate(resolve))

    const respPromise = POST(cashoutRequest({ amount: 52100 }))
    // The host reacts to the cash-out exceptions with a from-EGM transfer.
    await new Promise(resolve => setImmediate(resolve))
    input.write(muxFrame(CH_SAS, fromEgmFrame(52100, 'ROUTE-AFT')))

    const payload = await (await respPromise).json()
    expect(payload.success).toBe(true)
    expect(payload.method).toBe('aft')
    expect(readWallet().balance).toBe(0)
    // Card payout is metered as aftOut, not voucherOut, and no voucher is cut
    expect(readMeters().meters.aftOut).toBe(52100)
    expect(readMeters().meters.voucherOut).toBe(0)
    expect(generateVoucher).not.toHaveBeenCalled()
  })
})
