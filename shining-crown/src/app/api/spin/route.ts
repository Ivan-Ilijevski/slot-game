import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import fs from 'fs'
import path from 'path'

// Types
interface VirtualReels {
  reel1: string[]
  reel2: string[]
  reel3: string[]
  reel4: string[]
  reel5: string[]
}

interface SymbolMapping {
  [key: string]: string
}

interface SpinResult {
  reel: number
  position: number
  symbols: string[]
}

interface WinLine {
  payline: number
  symbols: string[]
  count: number
  symbol: string
  payout: number
}

type PaylinePosition = [number, number] // [reel, row]

// Load virtual reels and symbol mapping
let virtualReels: VirtualReels | null = null
let symbolMapping: SymbolMapping | null = null
let gameDataLoaded = false

// Paylines definition (reel, row) - 0-indexed
const PAYLINES: PaylinePosition[][] = [
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

// Paytable - payout multipliers for base bet of 1 credit
const PAYTABLE: { [key: string]: { [key: number]: number } } = {
  'Seven': { 2: 100, 3: 500, 4: 2500, 5: 50000 },
  'Watermelon': { 3: 400, 4: 1200, 5: 7000 },
  'Grape': { 3: 400, 4: 1200, 5: 7000 },
  'Bell': { 3: 200, 4: 400, 5: 2000 },
  'Plum': { 3: 100, 4: 300, 5: 1500 },
  'Orange': { 3: 100, 4: 300, 5: 1500 },
  'Cherry': { 3: 100, 4: 300, 5: 1500 },
  'Lemon': { 3: 100, 4: 300, 5: 1500 }
}

// Reverse symbol mapping for payout calculations
const SYMBOL_NAMES: { [key: string]: string } = {
  '00.png': 'Cherry',
  '01.png': 'Lemon',
  '02.png': 'Orange',
  '03.png': 'Plum',
  '04.png': 'Bell',
  '05.png': 'Grape',
  '06.png': 'Watermelon',
  '07.png': 'Seven',
  '08.png': 'Wild'
}

function loadGameData() {
  if (gameDataLoaded && process.env.NODE_ENV === 'production') {
    return // Skip reload in production
  }
  
  const assetsPath = path.join(process.cwd(), 'public', 'assets')
  
  // Load virtual reels
  const virtualReelsPath = path.join(assetsPath, 'reels_rtp91_boosted.json')
  virtualReels = JSON.parse(fs.readFileSync(virtualReelsPath, 'utf8'))
  
  // Load symbol mapping
  const symbolMappingPath = path.join(assetsPath, 'symbolMapping.json')
  symbolMapping = JSON.parse(fs.readFileSync(symbolMappingPath, 'utf8'))
  
  gameDataLoaded = true
  console.log('Loaded symbol mapping:', symbolMapping)
}

// Cryptographically secure random number generator
function secureRandom(min: number, max: number): number {
  const range = max - min + 1
  const bytesNeeded = Math.ceil(Math.log2(range) / 8)
  const maxValue = Math.pow(256, bytesNeeded)
  const threshold = maxValue - (maxValue % range)
  
  let randomValue: number
  do {
    const randomBytes_result = randomBytes(bytesNeeded)
    randomValue = 0
    for (let i = 0; i < bytesNeeded; i++) {
      randomValue = (randomValue << 8) + randomBytes_result[i]
    }
  } while (randomValue >= threshold)
  
  return min + (randomValue % range)
}

function expandWildsOnReels(reelResults: string[][]): { expandedResults: string[][], expandedReels: number[] } {
  // Create a copy of the reel results to avoid modifying the original
  const expandedResults = reelResults.map(reel => [...reel])
  const expandedReels: number[] = []
  
  console.log('=== WILD EXPANSION DEBUG ===')
  console.log('Original reels:', reelResults)
  
  // Check reels 2, 3, and 4 (indices 1, 2, 3) for wild symbols
  for (let reelIndex = 1; reelIndex <= 3; reelIndex++) {
    const reel = expandedResults[reelIndex]
    
    // Check if any position in this reel has a wild
    const hasWild = reel.some(symbol => SYMBOL_NAMES[symbol] === 'Wild')
    
    if (hasWild) {
      console.log(`Wild found on reel ${reelIndex + 1}, expanding entire reel`)
      expandedReels.push(reelIndex)
      
      // Expand: replace all symbols in this reel with wilds
      for (let rowIndex = 0; rowIndex < reel.length; rowIndex++) {
        expandedResults[reelIndex][rowIndex] = '08.png' // Wild symbol
      }
    }
  }
  
  console.log('Expanded reels:', expandedResults)
  console.log('Reels that expanded:', expandedReels)
  console.log('=== END WILD EXPANSION ===')
  
  return { expandedResults, expandedReels }
}

function calculateWins(reelResults: string[][]): { winLines: WinLine[], totalWin: number } {
  const winLines: WinLine[] = []
  let totalWin = 0

  console.log('=== PAYLINE CALCULATION DEBUG ===')
  console.log('Reel Results:', reelResults)

  // Check each payline
  for (let paylineIndex = 0; paylineIndex < PAYLINES.length; paylineIndex++) {
    const payline = PAYLINES[paylineIndex]
    const paylineSymbols: string[] = []
    
    // Get symbols along this payline
    for (const position of payline) {
      const symbol = reelResults[position[0]][position[1]]
      paylineSymbols.push(symbol)
    }
    
    console.log(`Payline ${paylineIndex + 1}:`, paylineSymbols)
    
    // Calculate wins for this payline
    const win = calculatePaylineWin(paylineSymbols, paylineIndex + 1)
    if (win) {
      console.log(`  WIN: ${win.count}x ${win.symbol} = ${win.payout} credits`)
      winLines.push(win)
      totalWin += win.payout
    } else {
      console.log('  No win')
    }
  }

  console.log('Total wins found:', winLines.length)
  console.log('Total win amount:', totalWin)
  console.log('=== END DEBUG ===')

  return { winLines, totalWin }
}

function calculatePaylineWin(symbols: string[], paylineNumber: number): WinLine | null {
  // Convert symbols to names for paytable lookup
  const symbolNames = symbols.map(symbol => SYMBOL_NAMES[symbol] || 'Unknown')
  
  console.log(`    Payline ${paylineNumber} - Symbol names:`, symbolNames)
  
  // Try all possible base symbols to find the best winning combination
  let bestWin: { symbol: string, count: number, payout: number } | null = null
  
  // Get all unique non-wild symbols from the payline
  const possibleBaseSymbols = [...new Set(symbolNames.filter(s => s !== 'Wild' && s !== 'Unknown'))]
  
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
      if (currentSymbol === baseSymbol || currentSymbol === 'Wild') {
        count++
      } else {
        break // Stop at first non-matching, non-wild symbol
      }
    }
    
    console.log(`    Testing ${baseSymbol}: consecutive count = ${count}`)
    
    // Check if this forms a winning combination
    const symbolPaytable = PAYTABLE[baseSymbol]
    if (symbolPaytable && symbolPaytable[count]) {
      const payout = symbolPaytable[count]
      console.log(`    ${baseSymbol} forms valid win: ${count}x = ${payout} credits`)
      
      // Keep track of the best (highest paying) combination
      if (!bestWin || payout > bestWin.payout) {
        bestWin = { symbol: baseSymbol, count, payout }
      }
    }
  }
  
  if (bestWin) {
    console.log(`    BEST WIN: ${bestWin.count}x ${bestWin.symbol} = ${bestWin.payout} credits`)
    return {
      payline: paylineNumber,
      symbols: symbols.slice(0, bestWin.count),
      count: bestWin.count,
      symbol: bestWin.symbol,
      payout: bestWin.payout
    }
  } else {
    console.log(`    No valid wins found`)
  }
  
  return null
}

export async function POST(_request: NextRequest) {
  try {
    loadGameData()
    
    if (!virtualReels || !symbolMapping) {
      return NextResponse.json({ error: 'Game data not loaded' }, { status: 500 })
    }
    
    // Generate random stop positions for each reel
    const results: SpinResult[] = []
    const reelKeys = ['reel1', 'reel2', 'reel3', 'reel4', 'reel5'] as const
    const reelResults: string[][] = []
    
    for (let i = 0; i < 5; i++) {
      const reelKey = reelKeys[i]
      const reel = virtualReels[reelKey]
      const reelLength = reel.length
      
      // Generate random stop position (0 to reelLength-1)
      const stopPosition = secureRandom(0, reelLength - 1)
      
      // Get 3 visible symbols (current position and 2 below)
      const visibleSymbols: string[] = []
      for (let j = 0; j < 3; j++) {
        const symbolIndex = (stopPosition + j) % reelLength
        const symbolName = reel[symbolIndex]
        // Direct mapping lookup without validation - assumes symbols are pre-validated
        visibleSymbols.push(symbolMapping![symbolName] || '00.png')
      }
      
      reelResults.push(visibleSymbols)
      results.push({
        reel: i + 1,
        position: stopPosition,
        symbols: visibleSymbols
      })
    }
    
    // Expand wilds on reels 2, 3, and 4 (index 1, 2, 3) before calculating wins
    const { expandedResults, expandedReels } = expandWildsOnReels(reelResults)
    
    // Calculate wins with expanded wilds
    const { winLines, totalWin } = calculateWins(expandedResults)
    
    // Add small delay to simulate server processing
    await new Promise(resolve => setTimeout(resolve, 100))
    
    return NextResponse.json({
      success: true,
      results,
      winLines,
      totalWin,
      expandedReels,
      timestamp: Date.now()
    })
    
  } catch (error) {
    console.error('Spin API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: 'Spin API - Use POST method to generate spin results',
    status: 'active' 
  })
}