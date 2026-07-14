import net from 'net'
import { CH_CMS, MuxParser, muxFrame } from './muxCodec'

// Relays the SMIB's CMS JSON channel to the CMS server over TCP, keeping the
// same mux framing on the TCP leg. Reconnects with backoff and buffers a
// bounded number of frames while the CMS is unreachable (the SMIB retries
// idempotent operations itself; the buffer just smooths short outages).
export class CmsBridge {
  private host: string
  private port: number
  private readonly onReply: (payload: Buffer) => void
  private readonly reconnectDelayMs: number
  private readonly bufferLimit: number

  private socket: net.Socket | null = null
  private connected = false
  private closed = false
  private pending: Buffer[] = []
  private reconnectTimer: NodeJS.Timeout | null = null
  private readonly parser = new MuxParser()

  constructor(opts: {
    host: string
    port: number
    onReply: (payload: Buffer) => void
    reconnectDelayMs?: number
    bufferLimit?: number
  }) {
    this.host = opts.host
    this.port = opts.port
    this.onReply = opts.onReply
    this.reconnectDelayMs = opts.reconnectDelayMs ?? 2000
    this.bufferLimit = opts.bufferLimit ?? 64
    this.connect()
  }

  isConnected(): boolean {
    return this.connected
  }

  pendingCount(): number {
    return this.pending.length
  }

  forward(payload: Buffer): void {
    if (this.connected && this.socket) {
      this.socket.write(muxFrame(CH_CMS, payload))
    } else {
      this.pending.push(payload)
      while (this.pending.length > this.bufferLimit) {
        this.pending.shift()
      }
    }
  }

  // Runtime reconfiguration: drop the current connection and reconnect to the
  // new CMS address, keeping any buffered frames.
  reconfigure(host: string, port: number): void {
    this.host = host
    this.port = port
    this.teardownSocket()
    this.connect()
  }

  close(): void {
    this.closed = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.teardownSocket()
  }

  private teardownSocket(): void {
    this.connected = false
    if (this.socket) {
      this.socket.removeAllListeners()
      this.socket.destroy()
      this.socket = null
    }
  }

  private connect(): void {
    if (this.closed) return

    const socket = net.createConnection({ host: this.host, port: this.port })
    this.socket = socket

    socket.on('connect', () => {
      this.connected = true
      console.log(`[SAS] CMS bridge connected to ${this.host}:${this.port}`)
      const queued = this.pending
      this.pending = []
      for (const payload of queued) {
        socket.write(muxFrame(CH_CMS, payload))
      }
    })

    socket.on('data', data => {
      for (const frame of this.parser.feed(data)) {
        if (frame.chan === CH_CMS) {
          this.onReply(frame.payload)
        }
      }
    })

    const scheduleReconnect = () => {
      if (this.socket !== socket) return // superseded by reconfigure()
      this.teardownSocket()
      if (this.closed) return
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
      this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelayMs)
    }

    socket.on('error', scheduleReconnect)
    socket.on('close', scheduleReconnect)
  }
}
