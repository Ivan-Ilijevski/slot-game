import { EXC_BUFFER_OVERFLOW, EXC_NONE, PRIORITY_EXCEPTIONS } from './types'

// Bounded exception queue drained by general polls. Priority exceptions
// (handpay, AFT group) jump ahead of normal ones. On overflow the oldest
// normal exception is dropped and a single 0x70 buffer-overflow exception is
// reported to the host.
export class ExceptionQueue {
  private priority: number[] = []
  private normal: number[] = []
  private overflowed = false

  constructor(private readonly capacity = 32) {}

  push(code: number): void {
    if (code === EXC_NONE) return

    if (PRIORITY_EXCEPTIONS.has(code)) {
      this.priority.push(code)
    } else {
      this.normal.push(code)
    }

    while (this.size() > this.capacity) {
      if (this.normal.length > 0) {
        this.normal.shift()
      } else {
        this.priority.shift()
      }
      this.overflowed = true
    }
  }

  pop(): number {
    if (this.overflowed) {
      this.overflowed = false
      return EXC_BUFFER_OVERFLOW
    }
    return this.priority.shift() ?? this.normal.shift() ?? EXC_NONE
  }

  size(): number {
    return this.priority.length + this.normal.length
  }
}
