import { numberToBcd } from './bcd'
import { crc16Kermit } from './crc16'
import { ExceptionQueue } from './exceptionQueue'
import {
  AFT_REG_READY,
  CMD_AFT_REGISTER,
  CMD_CURRENT_CREDITS,
  CMD_MACHINE_ID,
  CMD_TOTAL_METERS,
  CMD_VERSION_SERIAL,
  GENERAL_POLL_BASE,
  SAS_VERSION
} from './types'

// The five 0x19 meters, in wire order. `drop` is whatever the machine counts
// as physical money in — for this coinless kiosk the state provider maps the
// voucher-in meter into that slot.
export interface TotalMeters {
  coinIn: number
  coinOut: number
  drop: number
  jackpot: number
  gamesPlayed: number
}

export interface EgmStateProvider {
  getCreditsDeni(): number
  getTotalMeters(): TotalMeters
}

export interface SasEngineConfig {
  sasAddress: number
  assetNumber: number
  serialNumber: string
  gameId: string // 2 ASCII chars
  additionalGameId: string // 3 ASCII chars
  denomCode: number
  maxBetCode: number
  progressiveGroup: number
  paytableId: string // 6 ASCII chars
  basePercent: string // 4 ASCII chars
  linkTimeoutMs: number
}

// A long-poll handler returns the response body bytes (everything between
// [addr][cmd] and the CRC), or null to ignore the poll.
type LongPollHandler = (body: Buffer) => Buffer | null

const METER_MODULUS = 100_000_000 // 4-byte BCD rolls over at 10^8

export class SasEngine {
  private readonly config: SasEngineConfig
  private readonly state: EgmStateProvider
  readonly exceptions: ExceptionQueue
  private readonly extraHandlers = new Map<number, LongPollHandler>()

  private lastPollAt = 0
  // Implied-ACK cache: a byte-identical repeated long poll means the host
  // missed our response — resend it verbatim instead of re-executing the
  // handler (which may have side effects, e.g. AFT).
  private lastRequest: Buffer | null = null
  private lastResponse: Buffer | null = null

  constructor(opts: {
    config: SasEngineConfig
    state: EgmStateProvider
    exceptions: ExceptionQueue
  }) {
    this.config = opts.config
    this.state = opts.state
    this.exceptions = opts.exceptions
  }

  // Register an additional long-poll handler (AFT 0x72, lock 0x74, ...).
  registerHandler(cmd: number, handler: LongPollHandler): void {
    this.extraHandlers.set(cmd, handler)
  }

  isLinkUp(): boolean {
    return this.lastPollAt > 0 && Date.now() - this.lastPollAt < this.config.linkTimeoutMs
  }

  // Handle one SAS message (the payload of a CH_SAS mux frame). Returns the
  // raw SAS response bytes, or null when the message is not for us / invalid.
  handleSasPayload(data: Buffer): Buffer | null {
    const addr = this.config.sasAddress

    // General poll: single byte, no CRC. Accept 0x80|addr, and bare 0x80 for
    // the pre-G1 firmware that alternates 0x80/0x81.
    if (data.length === 1 && (data[0] === (GENERAL_POLL_BASE | addr) || data[0] === GENERAL_POLL_BASE)) {
      this.lastPollAt = Date.now()
      return Buffer.from([this.exceptions.pop()])
    }

    if (data.length < 4 || data[0] !== addr) {
      return null
    }

    const rxCrc = data[data.length - 2] | (data[data.length - 1] << 8)
    if (crc16Kermit(data.subarray(0, -2)) !== rxCrc) {
      return null
    }

    this.lastPollAt = Date.now()

    // Implied ACK: identical repeated long poll -> resend the last response.
    if (this.lastRequest && this.lastResponse && data.equals(this.lastRequest)) {
      return Buffer.from(this.lastResponse)
    }

    const cmd = data[1]
    const body = data.subarray(2, -2)

    const responseBody = this.dispatch(cmd, Buffer.from(body))
    if (responseBody === null) {
      this.lastRequest = null
      this.lastResponse = null
      return null
    }

    const frame = Buffer.concat([Buffer.from([addr, cmd]), responseBody])
    const crc = crc16Kermit(frame)
    const response = Buffer.concat([frame, Buffer.from([crc & 0xff, crc >> 8])])

    this.lastRequest = Buffer.from(data)
    this.lastResponse = Buffer.from(response)
    return response
  }

  private dispatch(cmd: number, body: Buffer): Buffer | null {
    switch (cmd) {
      case CMD_TOTAL_METERS:
        return this.totalMeters()
      case CMD_CURRENT_CREDITS:
        return numberToBcd(this.state.getCreditsDeni() % METER_MODULUS, 4)
      case CMD_MACHINE_ID:
        return this.machineInfo()
      case CMD_VERSION_SERIAL:
        return this.versionSerial()
      case CMD_AFT_REGISTER:
        return this.aftRegistration(body)
      default: {
        const handler = this.extraHandlers.get(cmd)
        if (handler) return handler(body)
        return null
      }
    }
  }

  private totalMeters(): Buffer {
    const meters = this.state.getTotalMeters()
    return Buffer.concat(
      [meters.coinIn, meters.coinOut, meters.drop, meters.jackpot, meters.gamesPlayed].map(v =>
        numberToBcd(v % METER_MODULUS, 4)
      )
    )
  }

  // 0x1F: game id (2 ASCII) + additional id (3) + denom + max bet +
  // progressive group + game options (2) + paytable (6) + base % (4)
  private machineInfo(): Buffer {
    return Buffer.concat([
      Buffer.from(this.config.gameId, 'ascii'),
      Buffer.from(this.config.additionalGameId, 'ascii'),
      Buffer.from([this.config.denomCode, this.config.maxBetCode, this.config.progressiveGroup]),
      Buffer.from([0x00, 0x00]), // game options
      Buffer.from(this.config.paytableId, 'ascii'),
      Buffer.from(this.config.basePercent, 'ascii')
    ])
  }

  // 0x54: length + SAS version (3 ASCII) + serial (ASCII)
  private versionSerial(): Buffer {
    const info = Buffer.concat([
      Buffer.from(SAS_VERSION, 'ascii'),
      Buffer.from(this.config.serialNumber, 'ascii')
    ])
    return Buffer.concat([Buffer.from([info.length]), info])
  }

  // 0x73: registration status + asset number (LE u32) + registration key (20)
  // + POS id (4). We run in "registration not required" mode: always ready,
  // zero key.
  private aftRegistration(_body: Buffer): Buffer {
    const payload = Buffer.alloc(1 + 4 + 20 + 4)
    payload[0] = AFT_REG_READY
    payload.writeUInt32LE(this.config.assetNumber, 1)
    return Buffer.concat([Buffer.from([payload.length]), payload])
  }
}
