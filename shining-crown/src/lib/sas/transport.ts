import type { Readable, Writable } from 'stream'
import { CH_CMS, CH_LOG, CH_SAS, MuxParser, muxFrame } from './muxCodec'

// Demuxes the SMIB wire (mux frames over a byte stream) into the three
// channels and frames outgoing payloads. The SAS handler returns the raw SAS
// response bytes (or null for no response); CMS and log payloads are one-way
// callbacks with sendCms() for the return path.
export interface TransportHandlers {
  onSas: (payload: Buffer) => Buffer | null
  onCms: (payload: Buffer) => void
  onLog: (line: string) => void
}

export class StreamTransport {
  private readonly parser = new MuxParser()
  private readonly output: Writable
  private readonly handlers: TransportHandlers

  constructor(opts: { input: Readable; output: Writable } & TransportHandlers) {
    this.output = opts.output
    this.handlers = { onSas: opts.onSas, onCms: opts.onCms, onLog: opts.onLog }
    opts.input.on('data', (data: Buffer) => this.feed(data))
  }

  protected feed(data: Buffer): void {
    for (const frame of this.parser.feed(data)) {
      switch (frame.chan) {
        case CH_SAS: {
          const response = this.handlers.onSas(frame.payload)
          if (response) {
            this.write(muxFrame(CH_SAS, response))
          }
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

  sendCms(payload: Buffer): void {
    this.write(muxFrame(CH_CMS, payload))
  }

  protected write(data: Buffer): void {
    this.output.write(data)
  }

  close(): void {
    // Streams are owned by the caller
  }
}
