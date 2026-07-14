import net from 'net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CmsBridge } from './cmsBridge'
import { CH_CMS, MuxParser, muxFrame } from './muxCodec'

let server: net.Server
let serverSockets: net.Socket[]
let received: Buffer[]
let port: number

beforeEach(async () => {
  serverSockets = []
  received = []
  server = net.createServer(socket => {
    serverSockets.push(socket)
    const parser = new MuxParser()
    socket.on('data', data => {
      for (const frame of parser.feed(data)) {
        received.push(frame.payload)
      }
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as net.AddressInfo).port
})

afterEach(async () => {
  for (const socket of serverSockets) socket.destroy()
  await new Promise<void>(resolve => server.close(() => resolve()))
})

async function waitFor(check: () => boolean, ms = 2000): Promise<void> {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timeout waiting for condition')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

describe('CMS bridge', () => {
  it('forwards SMIB CMS payloads to the CMS server over TCP (mux framed)', async () => {
    const bridge = new CmsBridge({ host: '127.0.0.1', port, onReply: () => {} })
    bridge.forward(Buffer.from('{"t":"ping"}', 'utf8'))
    await waitFor(() => received.length === 1)
    expect(received[0].toString()).toBe('{"t":"ping"}')
    bridge.close()
  })

  it('delivers CMS replies back through onReply', async () => {
    const replies: Buffer[] = []
    const bridge = new CmsBridge({ host: '127.0.0.1', port, onReply: p => replies.push(p) })
    bridge.forward(Buffer.from('{"t":"hello"}', 'utf8'))
    await waitFor(() => serverSockets.length === 1)
    serverSockets[0].write(muxFrame(CH_CMS, Buffer.from('{"t":"hello_ack"}', 'utf8')))
    await waitFor(() => replies.length === 1)
    expect(replies[0].toString()).toBe('{"t":"hello_ack"}')
    bridge.close()
  })

  it('buffers frames while disconnected and flushes on reconnect', async () => {
    // Point at a closed port first
    const closed = net.createServer()
    await new Promise<void>(resolve => closed.listen(0, '127.0.0.1', resolve))
    const closedPort = (closed.address() as net.AddressInfo).port
    await new Promise<void>(resolve => closed.close(() => resolve()))

    const bridge = new CmsBridge({
      host: '127.0.0.1',
      port: closedPort,
      onReply: () => {},
      reconnectDelayMs: 50
    })
    bridge.forward(Buffer.from('{"t":"queued"}', 'utf8'))
    await new Promise(resolve => setTimeout(resolve, 100))

    // Now move the bridge to the live server (runtime reconfiguration)
    bridge.reconfigure('127.0.0.1', port)
    await waitFor(() => received.length === 1)
    expect(received[0].toString()).toBe('{"t":"queued"}')
    bridge.close()
  })

  it('drops the oldest frames when the store-and-forward buffer overflows', async () => {
    const bridge = new CmsBridge({
      host: '127.0.0.1',
      port: 1, // never connects
      onReply: () => {},
      reconnectDelayMs: 10_000,
      bufferLimit: 3
    })
    for (let i = 0; i < 5; i++) {
      bridge.forward(Buffer.from(`{"n":${i}}`, 'utf8'))
    }
    expect(bridge.pendingCount()).toBe(3)
    bridge.close()
  })
})
