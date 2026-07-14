import fs from 'fs'
import os from 'os'
import path from 'path'
import { PassThrough } from 'stream'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { numberToBcd } from './bcd'
import { crc16Kermit } from './crc16'
import { CH_SAS, muxFrame } from './muxCodec'
import { __resetSasServiceForTests, getSasService, startSasService } from './singleton'
import { readAftState } from './aft'
import { EXC_CASHOUT_BUTTON, EXC_HOST_CASHOUT_REQUEST } from './types'

const originalCwd = process.cwd()
let fixtureDir: string

function seedWallet(balance: number) {
  fs.writeFileSync(path.join(fixtureDir, 'src', 'data', 'wallet.json'), JSON.stringify({
    schemaVersion: 2, unit: 'deni', balance, currency: 'MKD', lastUpdated: new Date().toISOString()
  }))
}

function fromEgmFrame(amountCents: number, txn: string): Buffer {
  const parts = [
    Buffer.from([0x00, 0x00, 0x00, 0x80]), // len, code=full, index, type=from-EGM
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

beforeEach(() => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'host-cashout-'))
  fs.mkdirSync(path.join(fixtureDir, 'src', 'data'), { recursive: true })
  seedWallet(52100)
  process.chdir(fixtureDir)
  __resetSasServiceForTests()
})

afterEach(() => {
  __resetSasServiceForTests()
  process.chdir(originalCwd)
  fs.rmSync(fixtureDir, { recursive: true, force: true })
})

describe('host cashout coordinator', () => {
  it('arms the latch and queues the cashout-button + host-cashout exceptions', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const service = startSasService({ testStream: { input, output } })

    const pending = service.requestHostCashout(52100, 200)
    // exceptions drained by a general poll, priority order preserved
    const first = service.exceptions.pop()
    const second = service.exceptions.pop()
    expect([first, second].sort()).toEqual([EXC_CASHOUT_BUTTON, EXC_HOST_CASHOUT_REQUEST].sort())
    expect(readAftState().cashoutLatch?.state).toBe('aft-window')

    await pending // let the window expire to clean up
  })

  it("resolves 'aft' when the host pulls the credits within the window", async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const service = startSasService({ testStream: { input, output } })

    const pending = service.requestHostCashout(52100, 1000)
    input.write(muxFrame(CH_SAS, fromEgmFrame(52100, 'CASH-1')))
    const result = await pending

    expect(result).toBe('aft')
    const wallet = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'src', 'data', 'wallet.json'), 'utf8'))
    expect(wallet.balance).toBe(0)
  })

  it("resolves 'timeout' when no transfer arrives", async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const service = startSasService({ testStream: { input, output } })

    const result = await service.requestHostCashout(52100, 100)
    expect(result).toBe('timeout')
  })

  it('commitVoucherCashout blocks a late from-EGM transfer', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const service = startSasService({ testStream: { input, output } })

    await service.requestHostCashout(52100, 50) // times out
    const committedBalance = await service.commitVoucherCashout()
    expect(committedBalance).toBe(52100) // nothing was pulled

    // A late transfer now must be refused; the balance stays put for the voucher
    input.write(muxFrame(CH_SAS, fromEgmFrame(52100, 'LATE')))
    await service.aft.whenSettled()
    const wallet = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'src', 'data', 'wallet.json'), 'utf8'))
    expect(wallet.balance).toBe(52100)

    service.releaseCashout()
    expect(readAftState().cashoutLatch?.state).toBe('idle')
  })
})
