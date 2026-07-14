import { MuxParser, muxFrame, CH_SAS, CH_CMS, CH_LOG } from './muxCodec'
import { pickSerialPort } from './sasConfig'
import type { TransportHandlers } from './transport'

interface OpenPort {
  write(data: Buffer): void
  close(): void
  path: string
}

// Owns the USB-UART link to the SMIB: opens the port at 115200 8N1 with
// DTR/RTS held low (toggling them resets the ESP32 — see host_sim.py),
// demuxes frames to the handlers, reconnects with backoff, and supports
// runtime re-pointing at a different device via reopen().
export class SerialTransport {
  private handlers: TransportHandlers
  private parser = new MuxParser()
  private port: OpenPort | null = null
  private desiredPath: string
  private closed = false
  private retryTimer: NodeJS.Timeout | null = null
  private readonly retryDelayMs: number

  constructor(opts: { path: string; retryDelayMs?: number } & TransportHandlers) {
    this.handlers = { onSas: opts.onSas, onCms: opts.onCms, onLog: opts.onLog }
    this.desiredPath = opts.path
    this.retryDelayMs = opts.retryDelayMs ?? 3000
    void this.openLoop()
  }

  isOpen(): boolean {
    return this.port !== null
  }

  currentPath(): string | null {
    return this.port?.path ?? null
  }

  reopen(path: string): void {
    this.desiredPath = path
    this.teardown()
    void this.openLoop()
  }

  close(): void {
    this.closed = true
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.teardown()
  }

  sendCms(payload: Buffer): void {
    this.port?.write(muxFrame(CH_CMS, payload))
  }

  private teardown(): void {
    if (this.port) {
      try {
        this.port.close()
      } catch {
        // already closed
      }
      this.port = null
    }
  }

  private scheduleRetry(): void {
    if (this.closed) return
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = setTimeout(() => void this.openLoop(), this.retryDelayMs)
  }

  private async openLoop(): Promise<void> {
    if (this.closed || this.port) return

    try {
      // Lazy import keeps the native module out of test runs and client bundles.
      const { SerialPort } = await import('serialport')

      const path = await pickSerialPort(this.desiredPath, async () =>
        (await SerialPort.list()).map(p => ({
          path: p.path,
          vendorId: p.vendorId ?? undefined,
          productId: p.productId ?? undefined
        }))
      )
      if (!path) {
        console.warn('[SAS] no suitable serial port found (settings: %s); retrying', this.desiredPath)
        this.scheduleRetry()
        return
      }

      const port = new SerialPort({ path, baudRate: 115200, autoOpen: false })

      await new Promise<void>((resolve, reject) => {
        port.open(err => (err ? reject(err) : resolve()))
      })
      // DTR/RTS low: opening with them asserted resets the CYD's ESP32
      await new Promise<void>((resolve, reject) => {
        port.set({ dtr: false, rts: false }, err => (err ? reject(err) : resolve()))
      })

      this.parser = new MuxParser()
      port.on('data', (data: Buffer) => this.feed(data))
      port.on('close', () => {
        console.warn('[SAS] serial port closed')
        this.port = null
        this.scheduleRetry()
      })
      port.on('error', (err: Error) => {
        console.error('[SAS] serial port error:', err.message)
        try {
          port.close()
        } catch {
          // ignore
        }
      })

      this.port = {
        write: data => port.write(data),
        close: () => port.close(),
        path
      }
      console.log(`[SAS] serial link open on ${path} @ 115200`)
    } catch (error) {
      console.error('[SAS] failed to open serial port:', error instanceof Error ? error.message : error)
      this.scheduleRetry()
    }
  }

  private feed(data: Buffer): void {
    for (const frame of this.parser.feed(data)) {
      switch (frame.chan) {
        case CH_SAS: {
          const response = this.handlers.onSas(frame.payload)
          if (response) this.port?.write(muxFrame(CH_SAS, response))
          break
        }
        case CH_CMS:
          this.handlers.onCms(frame.payload)
          break
        case CH_LOG:
          this.handlers.onLog(frame.payload.toString('utf8'))
          break
      }
    }
  }
}
