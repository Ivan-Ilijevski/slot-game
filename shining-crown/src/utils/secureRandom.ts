import { randomBytes } from 'crypto'

export function secureRandom(min: number, max: number): number {
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max < min) {
    throw new Error('Invalid random range')
  }

  const range = max - min + 1
  if (range === 1) return min
  const bytesNeeded = Math.ceil(Math.log2(range) / 8)
  const maxValue = 256 ** bytesNeeded
  const threshold = maxValue - (maxValue % range)

  let randomValue: number
  do {
    const bytes = randomBytes(bytesNeeded)
    randomValue = 0
    for (const byte of bytes) {
      randomValue = (randomValue << 8) + byte
    }
  } while (randomValue >= threshold)

  return min + (randomValue % range)
}
