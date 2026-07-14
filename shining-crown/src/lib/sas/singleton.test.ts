import fs from 'fs'
import os from 'os'
import path from 'path'
import { PassThrough } from 'stream'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { crc16Kermit } from './crc16'
import { CH_SAS, MuxParser, muxFrame } from './muxCodec'
import { __resetSasServiceForTests, getSasService, startSasService } from './singleton'
import { EXC_GAME_STARTED } from './types'

const originalCwd = process.cwd()
let fixtureDir: string

beforeEach(() => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sas-singleton-'))
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
  __resetSasServiceForTests()
})

afterEach(() => {
  __resetSasServiceForTests()
  process.chdir(originalCwd)
  fs.rmSync(fixtureDir, { recursive: true, force: true })
})

function longPoll(cmd: number): Buffer {
  const frame = Buffer.from([0x01, cmd])
  const crc = crc16Kermit(frame)
  return Buffer.concat([frame, Buffer.from([crc & 0xff, crc >> 8])])
}

describe('SAS service singleton', () => {
  it('is a safe no-op before start', () => {
    const sas = getSasService()
    expect(() => sas.queueException(EXC_GAME_STARTED)).not.toThrow()
    expect(sas.isLinkUp()).toBe(false)
    expect(sas.status().running).toBe(false)
  })

  it('serves live wallet credits over a stream transport once started', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    startSasService({ testStream: { input, output } })

    input.write(muxFrame(CH_SAS, longPoll(0x1a)))
    await new Promise(resolve => setImmediate(resolve))

    const frames = new MuxParser().feed(output.read() as Buffer)
    expect(frames).toHaveLength(1)
    // credits BCD4 at offset 2: 52100 deni -> 00 05 21 00
    expect(frames[0].payload.subarray(2, 6).toString('hex')).toBe('00052100')
  })

  it('reports queued exceptions through general polls', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    startSasService({ testStream: { input, output } })

    getSasService().queueException(EXC_GAME_STARTED)
    input.write(muxFrame(CH_SAS, Buffer.from([0x81])))
    await new Promise(resolve => setImmediate(resolve))

    const frames = new MuxParser().feed(output.read() as Buffer)
    expect(frames[0].payload).toEqual(Buffer.from([EXC_GAME_STARTED]))
  })

  it('start is idempotent', () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const first = startSasService({ testStream: { input, output } })
    const second = startSasService({ testStream: { input, output } })
    expect(second).toBe(first)
  })
})
