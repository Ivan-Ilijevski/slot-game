import { describe, expect, it, vi } from 'vitest'
import { crc16Kermit } from './crc16'
import { SasEngine } from './engine'
import { ExceptionQueue } from './exceptionQueue'
import { EXC_GAME_STARTED } from './types'
import type { EgmStateProvider } from './engine'

// Golden vectors generated with tools/host_sim/sas_egm.py configured
// identically (asset 1001, serial SHINING-CROWN-001, game SC, credits
// 66012100, meters coinIn=1000 coinOut=2500 drop=52100 jackpot=0 games=2).

const state: EgmStateProvider = {
  getCreditsDeni: () => 66012100,
  getTotalMeters: () => ({ coinIn: 1000, coinOut: 2500, drop: 52100, jackpot: 0, gamesPlayed: 2 })
}

function makeEngine(overrides: Partial<ConstructorParameters<typeof SasEngine>[0]> = {}) {
  return new SasEngine({
    config: {
      sasAddress: 0x01,
      assetNumber: 1001,
      serialNumber: 'SHINING-CROWN-001',
      gameId: 'SC',
      additionalGameId: '001',
      denomCode: 0x01,
      maxBetCode: 0x05,
      progressiveGroup: 0x00,
      paytableId: 'PT0001',
      basePercent: '9500',
      linkTimeoutMs: 2000
    },
    state,
    exceptions: new ExceptionQueue(),
    ...overrides
  })
}

function longPoll(cmd: number, body: Buffer = Buffer.alloc(0)): Buffer {
  const frame = Buffer.concat([Buffer.from([0x01, cmd]), body])
  const crc = crc16Kermit(frame)
  return Buffer.concat([frame, Buffer.from([crc & 0xff, crc >> 8])])
}

describe('SAS engine', () => {
  it('answers a general poll with 0x00 when no exception is queued', () => {
    const engine = makeEngine()
    expect(engine.handleSasPayload(Buffer.from([0x81]))).toEqual(Buffer.from([0x00]))
    // legacy alternation from the unfixed firmware
    expect(engine.handleSasPayload(Buffer.from([0x80]))).toEqual(Buffer.from([0x00]))
  })

  it('drains queued exceptions through general polls', () => {
    const exceptions = new ExceptionQueue()
    const engine = makeEngine({ exceptions })
    exceptions.push(EXC_GAME_STARTED)
    expect(engine.handleSasPayload(Buffer.from([0x81]))).toEqual(Buffer.from([0x7e]))
    expect(engine.handleSasPayload(Buffer.from([0x81]))).toEqual(Buffer.from([0x00]))
  })

  it('answers 0x19 with the five meters (golden)', () => {
    const engine = makeEngine()
    expect(engine.handleSasPayload(longPoll(0x19))?.toString('hex'))
      .toBe('011900001000000025000005210000000000000000029435')
  })

  it('answers 0x1A with current credits (golden)', () => {
    const engine = makeEngine()
    expect(engine.handleSasPayload(longPoll(0x1a))?.toString('hex'))
      .toBe('011a660121008a4e')
  })

  it('rolls 0x1A credits over at 10^8', () => {
    const engine = makeEngine({
      state: { ...state, getCreditsDeni: () => 123456789 }
    })
    const resp = engine.handleSasPayload(longPoll(0x1a))
    // 123456789 % 1e8 = 23456789
    expect(resp?.subarray(2, 6).toString('hex')).toBe('23456789')
  })

  it('answers 0x1F with game/denom info (golden)', () => {
    const engine = makeEngine()
    expect(engine.handleSasPayload(longPoll(0x1f))?.toString('hex'))
      .toBe('011f5343303031010500000050543030303139353030f887')
  })

  it('answers 0x54 with SAS version and serial (golden)', () => {
    const engine = makeEngine()
    expect(engine.handleSasPayload(longPoll(0x54))?.toString('hex'))
      .toBe('0154143630335348494e494e472d43524f574e2d3030317647')
  })

  it('answers 0x73 interrogate with registration-ready and the asset number (golden)', () => {
    const engine = makeEngine()
    expect(engine.handleSasPayload(longPoll(0x73, Buffer.from([0x01, 0xff])))?.toString('hex'))
      .toBe('01731d01e9030000000000000000000000000000000000000000000000000000b1af')
  })

  it('ignores frames with bad CRC', () => {
    const engine = makeEngine()
    expect(engine.handleSasPayload(Buffer.from([0x01, 0x1a, 0xde, 0xad]))).toBeNull()
  })

  it('ignores frames addressed to another EGM', () => {
    const engine = makeEngine()
    const frame = Buffer.concat([Buffer.from([0x02, 0x1a]), Buffer.from([0x00, 0x00])])
    expect(engine.handleSasPayload(frame)).toBeNull()
  })

  it('ignores unsupported long polls', () => {
    const engine = makeEngine()
    expect(engine.handleSasPayload(longPoll(0x2f))).toBeNull()
  })

  it('resends the cached response verbatim when the same long poll repeats (implied ACK)', () => {
    let credits = 100
    const engine = makeEngine({
      state: { ...state, getCreditsDeni: () => credits }
    })
    const first = engine.handleSasPayload(longPoll(0x1a))
    credits = 200
    const repeat = engine.handleSasPayload(longPoll(0x1a))
    expect(repeat).toEqual(first) // cached, not re-evaluated

    engine.handleSasPayload(longPoll(0x19)) // different poll acks the previous one
    const fresh = engine.handleSasPayload(longPoll(0x1a))
    expect(fresh).not.toEqual(first)
  })

  it('tracks link state from poll activity', () => {
    vi.useFakeTimers()
    try {
      const engine = makeEngine()
      expect(engine.isLinkUp()).toBe(false)
      engine.handleSasPayload(Buffer.from([0x81]))
      expect(engine.isLinkUp()).toBe(true)
      vi.advanceTimersByTime(2500)
      expect(engine.isLinkUp()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
