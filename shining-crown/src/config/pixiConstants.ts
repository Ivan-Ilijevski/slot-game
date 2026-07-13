// Shared PIXI scene constants for the slot game.
// Kept free of any pixi.js / @pixi/sound imports so server-side rendering can
// safely pull in modules that only need these values.

export const DESIGN_WIDTH = 1920
export const DESIGN_HEIGHT = 1080

export const SYMBOL_WIDTH = 260
export const SYMBOL_HEIGHT = 260
export const REEL_COUNT = 5
export const SYMBOLS_PER_REEL = 3
export const REEL_GAP = 28

// Calculate total reel area dimensions
const totalReelWidth = REEL_COUNT * SYMBOL_WIDTH + (REEL_COUNT - 1) * REEL_GAP
const totalReelHeight = SYMBOLS_PER_REEL * SYMBOL_HEIGHT

export const REEL_OFFSET_X = (DESIGN_WIDTH / 2) - (totalReelWidth / 2)
export const REEL_OFFSET_Y = (DESIGN_HEIGHT / 2 - 70) - (totalReelHeight / 2)

export const PAYLINE_COLORS = [
  0xFFD700, // Payline 1 - Gold
  0xFFFF00, // Payline 2 - Yellow
  0x00FF00, // Payline 3 - Green
  0xFF0000, // Payline 4 - Red
  0xFF0000, // Payline 5 - Red
  0x00FFFF, // Payline 6 - Cyan
  0x00FFFF, // Payline 7 - Cyan
  0xFF8C00, // Payline 8 - Orange
  0x00FF00, // Payline 9 - Green
  0x0000FF  // Payline 10 - Blue
]

export const PAYLINES_VISUAL = [
  [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1]], // Payline 1
  [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], // Payline 2
  [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2]], // Payline 3
  [[0, 0], [1, 1], [2, 2], [3, 1], [4, 0]], // Payline 4
  [[0, 2], [1, 1], [2, 0], [3, 1], [4, 2]], // Payline 5
  [[0, 0], [1, 0], [2, 1], [3, 2], [4, 2]], // Payline 6
  [[0, 2], [1, 2], [2, 1], [3, 0], [4, 0]], // Payline 7
  [[0, 1], [1, 2], [2, 2], [3, 2], [4, 1]], // Payline 8
  [[0, 1], [1, 0], [2, 0], [3, 0], [4, 1]], // Payline 9
  [[0, 0], [1, 1], [2, 1], [3, 1], [4, 0]]  // Payline 10
]

export const SYMBOL_NAME_TO_NUMBER: { [key: string]: string } = {
  'Cherry': '00',
  'Lemon': '01',
  'Orange': '02',
  'Plum': '03',
  'Bell': '04',
  'Grape': '05',
  'Watermelon': '06',
  'Seven': '07',
  'Wild': '08',
  'Star': '09',
  'Crown': '10'
}
