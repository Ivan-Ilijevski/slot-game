// CRC-16/KERMIT, as used both by the SAS protocol (appended LSB-first to long
// polls) and by the SMIB's mux framing. Port of tools/host_sim/mux.py
// crc16_kermit / main/mux/crc16.c.
export function crc16Kermit(data: Buffer | Uint8Array, initial = 0x0000): number {
  let crc = initial
  for (const byte of data) {
    crc ^= byte
    for (let i = 0; i < 8; i++) {
      crc = crc & 1 ? (crc >> 1) ^ 0x8408 : crc >> 1
    }
  }
  return crc
}
