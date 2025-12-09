// Payline calculation and win detection system for slot games
export type PaylinePosition = [number, number] // [reel, row]

export interface WinLine {
  payline: number
  symbols: string[]
  count: number
  symbol: string
  payout: number
  positions?: PaylinePosition[]
}

export interface PaylineConfig {
  patterns: PaylinePosition[][]
  paytable: { [symbolName: string]: { [count: number]: number } }
  symbolMapping: { [fileName: string]: string }
  reverseSymbolMapping: { [symbolName: string]: string }
  wildSymbol: string
  minWinCount: number
}

export interface WinCalculationResult {
  winLines: WinLine[]
  totalWin: number
  hasWins: boolean
  biggestWin: WinLine | null
  wildExpansions: number[]
}

export interface PaylineVisual {
  paylineNumber: number
  positions: PaylinePosition[]
  color: number
  isWinning: boolean
  winAmount?: number
}

// Default payline patterns (10 standard paylines)
export const DEFAULT_PAYLINES: PaylinePosition[][] = [
  [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1]], // Payline 1 - middle row
  [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], // Payline 2 - top row
  [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2]], // Payline 3 - bottom row
  [[0, 0], [1, 1], [2, 2], [3, 1], [4, 0]], // Payline 4 - V shape
  [[0, 2], [1, 1], [2, 0], [3, 1], [4, 2]], // Payline 5 - inverted V
  [[0, 0], [1, 0], [2, 1], [3, 2], [4, 2]], // Payline 6 - stairs up
  [[0, 2], [1, 2], [2, 1], [3, 0], [4, 0]], // Payline 7 - stairs down
  [[0, 1], [1, 2], [2, 2], [3, 2], [4, 1]], // Payline 8 - U shape
  [[0, 1], [1, 0], [2, 0], [3, 0], [4, 1]], // Payline 9 - inverted U
  [[0, 0], [1, 1], [2, 1], [3, 1], [4, 0]]  // Payline 10 - mountain
]

// Default paytable (base payout values that get multiplied by bet amount)
export const DEFAULT_PAYTABLE: { [key: string]: { [key: number]: number } } = {
  'Seven': { 2: 1, 3: 5, 4: 25, 5: 500 },
  'Watermelon': { 3: 4, 4: 12, 5: 70 },
  'Grape': { 3: 4, 4: 12, 5: 70 },
  'Bell': { 3: 2, 4: 4, 5: 20 },
  'Plum': { 3: 1, 4: 3, 5: 15 },
  'Orange': { 3: 1, 4: 3, 5: 15 },
  'Cherry': { 3: 1, 4: 3, 5: 15 },
  'Lemon': { 3: 1, 4: 3, 5: 15 }
}

// Default symbol mapping (filename to symbol name)
export const DEFAULT_SYMBOL_MAPPING: { [key: string]: string } = {
  '00.png': 'Cherry',
  '01.png': 'Lemon',
  '02.png': 'Orange',
  '03.png': 'Plum',
  '04.png': 'Bell',
  '05.png': 'Grape',
  '06.png': 'Watermelon',
  '07.png': 'Seven',
  '08.png': 'Wild',
  '09.png': 'Star',
  '10.png': 'Crown'
}

// Default reverse symbol mapping (symbol name to filename)
export const DEFAULT_REVERSE_SYMBOL_MAPPING: { [key: string]: string } = {
  'Cherry': '00.png',
  'Lemon': '01.png',
  'Orange': '02.png',
  'Plum': '03.png',
  'Bell': '04.png',
  'Grape': '05.png',
  'Watermelon': '06.png',
  'Seven': '07.png',
  'Wild': '08.png',
  'Star': '09.png',
  'Crown': '10.png'
}

// Payline colors for visual representation
export const DEFAULT_PAYLINE_COLORS: number[] = [
  0xFF0000, // Red
  0x00FF00, // Green
  0x0000FF, // Blue
  0xFFFF00, // Yellow
  0xFF00FF, // Magenta
  0x00FFFF, // Cyan
  0xFFA500, // Orange
  0x800080, // Purple
  0xFFC0CB, // Pink
  0x008000  // Dark Green
]

export class PaylineCalculator {
  private config: PaylineConfig

  constructor(config?: Partial<PaylineConfig>) {
    this.config = {
      patterns: DEFAULT_PAYLINES,
      paytable: DEFAULT_PAYTABLE,
      symbolMapping: DEFAULT_SYMBOL_MAPPING,
      reverseSymbolMapping: DEFAULT_REVERSE_SYMBOL_MAPPING,
      wildSymbol: 'Wild',
      minWinCount: 2,
      ...config
    }
  }

  // Main function to calculate all wins
  calculateWins(
    reelResults: string[][], 
    betMultiplier: number, 
    enableWildExpansion: boolean = true
  ): WinCalculationResult {
    console.log('=== PAYLINE CALCULATION DEBUG ===')
    console.log('Reel Results:', reelResults)
    console.log('Bet Multiplier:', betMultiplier)

    // Expand wilds if enabled
    let processedResults = reelResults
    let expandedReels: number[] = []
    
    if (enableWildExpansion) {
      const expansion = this.expandWildsOnReels(reelResults)
      processedResults = expansion.expandedResults
      expandedReels = expansion.expandedReels
    }

    const winLines: WinLine[] = []
    let totalWin = 0

    // Check each payline
    for (let paylineIndex = 0; paylineIndex < this.config.patterns.length; paylineIndex++) {
      const payline = this.config.patterns[paylineIndex]
      const paylineSymbols: string[] = []
      
      // Get symbols along this payline
      for (const position of payline) {
        const symbol = processedResults[position[0]][position[1]]
        paylineSymbols.push(symbol)
      }
      
      console.log(`Payline ${paylineIndex + 1}:`, paylineSymbols)
      
      // Calculate wins for this payline
      const win = this.calculatePaylineWin(paylineSymbols, paylineIndex + 1, betMultiplier, payline)
      if (win) {
        console.log(`  WIN: ${win.count}x ${win.symbol} = ${win.payout.toFixed(2)} (base: ${(win.payout / betMultiplier).toFixed(2)}, bet: ${betMultiplier.toFixed(2)})`)
        winLines.push(win)
        totalWin += win.payout
      } else {
        console.log('  No win')
      }
    }

    const biggestWin = winLines.length > 0 
      ? winLines.reduce((max, current) => max.payout > current.payout ? max : current)
      : null

    console.log('Total wins found:', winLines.length)
    console.log('Total win amount:', totalWin)
    console.log('=== END DEBUG ===')

    return {
      winLines,
      totalWin,
      hasWins: winLines.length > 0,
      biggestWin,
      wildExpansions: expandedReels
    }
  }

  // Calculate wins for a specific payline
  private calculatePaylineWin(
    symbols: string[], 
    paylineNumber: number, 
    betMultiplier: number,
    positions: PaylinePosition[]
  ): WinLine | null {
    // Convert symbols to names for paytable lookup
    const symbolNames = symbols.map(symbol => this.config.symbolMapping[symbol] || 'Unknown')
    
    console.log(`    Payline ${paylineNumber} - Symbol names:`, symbolNames)
    
    // Try all possible base symbols to find the best winning combination
    let bestWin: { symbol: string, count: number, payout: number } | null = null
    
    // Get all unique non-wild symbols from the payline
    const possibleBaseSymbols = [...new Set(symbolNames.filter(s => s !== this.config.wildSymbol && s !== 'Unknown'))]
    
    // If no non-wild symbols, try Seven (for all-wild case)
    if (possibleBaseSymbols.length === 0) {
      possibleBaseSymbols.push('Seven')
    }
    
    console.log(`    Possible base symbols:`, possibleBaseSymbols)
    
    // Test each possible base symbol
    for (const baseSymbol of possibleBaseSymbols) {
      // Count consecutive matching symbols from left to right (including wilds)
      let count = 0
      for (let i = 0; i < symbolNames.length; i++) {
        const currentSymbol = symbolNames[i]
        
        // Symbol matches if it's the base symbol or a wild
        if (currentSymbol === baseSymbol || currentSymbol === this.config.wildSymbol) {
          count++
        } else {
          break // Stop at first non-matching, non-wild symbol
        }
      }
      
      console.log(`    Testing ${baseSymbol}: consecutive count = ${count}`)
      
      // Check if this forms a winning combination
      const symbolPaytable = this.config.paytable[baseSymbol]
      if (symbolPaytable && symbolPaytable[count] && count >= this.config.minWinCount) {
        const basePayout = symbolPaytable[count]
        const payout = basePayout * betMultiplier // Apply bet multiplier
        console.log(`    ${baseSymbol} forms valid win: ${count}x = ${basePayout} base * ${betMultiplier.toFixed(2)} bet = ${payout.toFixed(2)}`)
        
        // Keep track of the best (highest paying) combination
        if (!bestWin || payout > bestWin.payout) {
          bestWin = { symbol: baseSymbol, count, payout }
        }
      }
    }
    
    if (bestWin) {
      console.log(`    BEST WIN: ${bestWin.count}x ${bestWin.symbol} = ${bestWin.payout.toFixed(2)}`)
      return {
        payline: paylineNumber,
        symbols: symbols.slice(0, bestWin.count),
        count: bestWin.count,
        symbol: bestWin.symbol,
        payout: bestWin.payout,
        positions: positions.slice(0, bestWin.count)
      }
    } else {
      console.log(`    No valid wins found`)
    }
    
    return null
  }

  // Expand wild symbols on reels 2, 3, and 4
  expandWildsOnReels(reelResults: string[][]): { expandedResults: string[][], expandedReels: number[] } {
    // Create a copy of the reel results to avoid modifying the original
    const expandedResults = reelResults.map(reel => [...reel])
    const expandedReels: number[] = []
    
    console.log('=== WILD EXPANSION DEBUG ===')
    console.log('Original reels:', reelResults)
    
    // Check reels 2, 3, and 4 (indices 1, 2, 3) for wild symbols
    for (let reelIndex = 1; reelIndex <= 3; reelIndex++) {
      const reel = expandedResults[reelIndex]
      
      // Check if any position in this reel has a wild
      const hasWild = reel.some(symbol => this.config.symbolMapping[symbol] === this.config.wildSymbol)
      
      if (hasWild) {
        console.log(`Wild found on reel ${reelIndex + 1}, expanding entire reel`)
        expandedReels.push(reelIndex)
        
        // Expand: replace all symbols in this reel with wilds
        for (let rowIndex = 0; rowIndex < reel.length; rowIndex++) {
          expandedResults[reelIndex][rowIndex] = this.config.reverseSymbolMapping[this.config.wildSymbol] || '08.png'
        }
      }
    }
    
    console.log('Expanded reels:', expandedResults)
    console.log('Reels that expanded:', expandedReels)
    console.log('=== END WILD EXPANSION ===')
    
    return { expandedResults, expandedReels }
  }

  // Get payline visuals for rendering
  getPaylineVisuals(winLines: WinLine[]): PaylineVisual[] {
    const visuals: PaylineVisual[] = []
    
    // Add all paylines (winning and non-winning)
    this.config.patterns.forEach((positions, index) => {
      const paylineNumber = index + 1
      const winLine = winLines.find(win => win.payline === paylineNumber)
      
      visuals.push({
        paylineNumber,
        positions,
        color: DEFAULT_PAYLINE_COLORS[index] || 0xFFFFFF,
        isWinning: !!winLine,
        winAmount: winLine?.payout
      })
    })
    
    return visuals
  }

  // Get winning positions for animation
  getWinningPositions(winLines: WinLine[]): Array<{ reelIndex: number, rowIndex: number, symbolName: string }> {
    const winningPositions: Array<{ reelIndex: number, rowIndex: number, symbolName: string }> = []
    
    winLines.forEach(winLine => {
      if (winLine.positions) {
        winLine.positions.forEach(([reelIndex, rowIndex]) => {
          winningPositions.push({
            reelIndex,
            rowIndex,
            symbolName: winLine.symbol
          })
        })
      }
    })
    
    return winningPositions
  }

  // Validate payline patterns
  validatePaylines(): { isValid: boolean, errors: string[] } {
    const errors: string[] = []
    
    this.config.patterns.forEach((payline, index) => {
      if (payline.length !== 5) {
        errors.push(`Payline ${index + 1} must have exactly 5 positions`)
      }
      
      payline.forEach(([reel, row], posIndex) => {
        if (reel < 0 || reel >= 5) {
          errors.push(`Payline ${index + 1}, position ${posIndex + 1}: invalid reel ${reel}`)
        }
        if (row < 0 || row >= 3) {
          errors.push(`Payline ${index + 1}, position ${posIndex + 1}: invalid row ${row}`)
        }
      })
    })
    
    return { isValid: errors.length === 0, errors }
  }

  // Calculate RTP (Return to Player) for a symbol combination
  calculateRTP(symbol: string, count: number, betAmount: number): number {
    const symbolPaytable = this.config.paytable[symbol]
    if (!symbolPaytable || !symbolPaytable[count]) return 0
    
    const payout = symbolPaytable[count] * betAmount
    return betAmount > 0 ? (payout / betAmount) * 100 : 0
  }

  // Get symbol statistics
  getSymbolStats(): { [symbol: string]: { minPayout: number, maxPayout: number, counts: number[] } } {
    const stats: { [symbol: string]: { minPayout: number, maxPayout: number, counts: number[] } } = {}
    
    Object.entries(this.config.paytable).forEach(([symbol, payouts]) => {
      const payoutValues = Object.values(payouts)
      stats[symbol] = {
        minPayout: Math.min(...payoutValues),
        maxPayout: Math.max(...payoutValues),
        counts: Object.keys(payouts).map(Number).sort()
      }
    })
    
    return stats
  }

  // Update configuration
  updateConfig(newConfig: Partial<PaylineConfig>): void {
    this.config = { ...this.config, ...newConfig }
  }

  // Get current configuration
  getConfig(): PaylineConfig {
    return { ...this.config }
  }
}

// Utility functions
export const PaylineUtils = {
  // Create test reel results for specific symbol
  createTestReels: (symbol: string): string[][] => {
    const symbolFile = DEFAULT_REVERSE_SYMBOL_MAPPING[symbol] || '00.png'
    return Array(5).fill(Array(3).fill(symbolFile))
  },

  // Create mixed test reels
  createMixedTestReels: (symbols: string[]): string[][] => {
    return Array(5).fill(null).map(() => 
      Array(3).fill(null).map((_, index) => 
        DEFAULT_REVERSE_SYMBOL_MAPPING[symbols[index % symbols.length]] || '00.png'
      )
    )
  },

  // Calculate total possible combinations
  getTotalCombinations: (symbolCount: number, reelCount: number = 5, rowCount: number = 3): number => {
    return Math.pow(symbolCount, reelCount * rowCount)
  },

  // Get payline description
  getPaylineDescription: (paylineIndex: number): string => {
    const descriptions = [
      'Middle Row',
      'Top Row', 
      'Bottom Row',
      'V Shape',
      'Inverted V',
      'Stairs Up',
      'Stairs Down',
      'U Shape',
      'Inverted U',
      'Mountain'
    ]
    return descriptions[paylineIndex] || `Payline ${paylineIndex + 1}`
  },

  // Convert symbol name to display name
  getDisplayName: (symbolName: string): string => {
    const displayNames: { [key: string]: string } = {
      'Cherry': '🍒 Cherry',
      'Lemon': '🍋 Lemon',
      'Orange': '🍊 Orange',
      'Plum': '🫐 Plum',
      'Bell': '🔔 Bell',
      'Grape': '🍇 Grape',
      'Watermelon': '🍉 Watermelon',
      'Seven': '7️⃣ Seven',
      'Wild': '🌟 Wild',
      'Star': '⭐ Star',
      'Crown': '👑 Crown'
    }
    return displayNames[symbolName] || symbolName
  }
}