// Big-endian packed BCD (most significant byte first), as used by SAS meters
// and AFT amounts. Port of the sas_defs.h helpers. Values that exceed the
// field width keep the least significant digits — this is exactly the SAS
// 10^(2n) meter rollover behavior.
export function numberToBcd(value: number, bytes: number): Buffer {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`BCD values must be non-negative integers, got ${value}`)
  }
  const digits = String(value).padStart(bytes * 2, '0').slice(-bytes * 2)
  const out = Buffer.alloc(bytes)
  for (let i = 0; i < bytes; i++) {
    out[i] = (Number(digits[i * 2]) << 4) | Number(digits[i * 2 + 1])
  }
  return out
}

export function bcdToNumber(data: Buffer | Uint8Array): number {
  let value = 0
  for (const byte of data) {
    value = value * 100 + (byte >> 4) * 10 + (byte & 0x0f)
  }
  return value
}
