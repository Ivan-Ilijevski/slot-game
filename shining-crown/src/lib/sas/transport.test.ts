import { PassThrough } from 'stream'
import { describe, expect, it, vi } from 'vitest'
import { CH_CMS, CH_LOG, CH_SAS, MuxParser, muxFrame } from './muxCodec'
import { StreamTransport } from './transport'

function makeWire() {
  // What the SMIB would see: we write into `toTransport`, transport writes
  // into `fromTransport`.
  const toTransport = new PassThrough()
  const fromTransport = new PassThrough()
  return { toTransport, fromTransport }
}

describe('StreamTransport', () => {
  it('routes SAS frames to the handler and writes the reply back as a mux frame', async () => {
    const { toTransport, fromTransport } = makeWire()
    const onSas = vi.fn((payload: Buffer) =>
      payload[0] === 0x81 ? Buffer.from([0x00]) : null
    )
    new StreamTransport({
      input: toTransport,
      output: fromTransport,
      onSas,
      onCms: () => {},
      onLog: () => {}
    })

    toTransport.write(muxFrame(CH_SAS, Buffer.from([0x81])))
    await new Promise(resolve => setImmediate(resolve))

    expect(onSas).toHaveBeenCalledWith(Buffer.from([0x81]))
    const parser = new MuxParser()
    const frames = parser.feed(fromTransport.read() as Buffer)
    expect(frames).toEqual([{ chan: CH_SAS, payload: Buffer.from([0x00]) }])
  })

  it('does not reply when the handler returns null', async () => {
    const { toTransport, fromTransport } = makeWire()
    new StreamTransport({
      input: toTransport,
      output: fromTransport,
      onSas: () => null,
      onCms: () => {},
      onLog: () => {}
    })

    toTransport.write(muxFrame(CH_SAS, Buffer.from([0x01, 0x2f, 0x00, 0x00])))
    await new Promise(resolve => setImmediate(resolve))
    expect(fromTransport.read()).toBeNull()
  })

  it('routes CMS payloads to the CMS handler and can send CMS frames back', async () => {
    const { toTransport, fromTransport } = makeWire()
    const onCms = vi.fn()
    const transport = new StreamTransport({
      input: toTransport,
      output: fromTransport,
      onSas: () => null,
      onCms,
      onLog: () => {}
    })

    toTransport.write(muxFrame(CH_CMS, Buffer.from('{"t":"ping"}', 'utf8')))
    await new Promise(resolve => setImmediate(resolve))
    expect(onCms).toHaveBeenCalledWith(Buffer.from('{"t":"ping"}', 'utf8'))

    transport.sendCms(Buffer.from('{"t":"pong"}', 'utf8'))
    const parser = new MuxParser()
    const frames = parser.feed(fromTransport.read() as Buffer)
    expect(frames).toEqual([{ chan: CH_CMS, payload: Buffer.from('{"t":"pong"}', 'utf8') }])
  })

  it('decodes log-channel frames as text lines', async () => {
    const { toTransport, fromTransport } = makeWire()
    const onLog = vi.fn()
    new StreamTransport({
      input: toTransport,
      output: fromTransport,
      onSas: () => null,
      onCms: () => {},
      onLog
    })

    toTransport.write(muxFrame(CH_LOG, Buffer.from('sas: link up', 'utf8')))
    await new Promise(resolve => setImmediate(resolve))
    expect(onLog).toHaveBeenCalledWith('sas: link up')
  })

  it('survives garbage interleaved with frames', async () => {
    const { toTransport, fromTransport } = makeWire()
    const onSas = vi.fn(() => Buffer.from([0x00]))
    new StreamTransport({
      input: toTransport,
      output: fromTransport,
      onSas,
      onCms: () => {},
      onLog: () => {}
    })

    toTransport.write(Buffer.from('boot rom noise', 'ascii'))
    toTransport.write(muxFrame(CH_SAS, Buffer.from([0x81])))
    await new Promise(resolve => setImmediate(resolve))
    expect(onSas).toHaveBeenCalledTimes(1)
  })
})
