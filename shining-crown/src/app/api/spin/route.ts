import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import fs from 'fs'
import path from 'path'
import { deductBalance, addBalance, validateBalance, readWallet } from '../../../utils/wallet'
import { formatCurrency } from '../../../config/currency'

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

// Paytable - base payout values that get multiplied by bet amount
const PAYTABLE: { [key: string]: { [key: number]: number } } = {
  'Seven': { 2: 1, 3: 5, 4: 25, 5: 500 },
  'Watermelon': { 3: 4, 4: 12, 5: 70 },
  'Grape': { 3: 4, 4: 12, 5: 70 },
  'Bell': { 3: 2, 4: 4, 5: 20 },
  'Plum': { 3: 1, 4: 3, 5: 15 },
  'Orange': { 3: 1, 4: 3, 5: 15 },
  'Cherry': { 3: 1, 4: 3, 5: 15 },
  'Lemon': { 3: 1, 4: 3, 5: 15 }
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
  const virtualReelsPath = path.join(assetsPath, 'virtual_reels_revamped.json')
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

function calculateWins(reelResults: string[][], betMultiplier: number): { winLines: WinLine[], totalWin: number } {
  const winLines: WinLine[] = []
  let totalWin = 0

  console.log('=== PAYLINE CALCULATION DEBUG ===')
  console.log('Reel Results:', reelResults)
  console.log('Bet Multiplier:', betMultiplier)

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
    const win = calculatePaylineWin(paylineSymbols, paylineIndex + 1, betMultiplier)
    if (win) {
      console.log(`  WIN: ${win.count}x ${win.symbol} = ${formatCurrency(win.payout)} (base: ${win.payout / betMultiplier}, bet: ${formatCurrency(betMultiplier)})`)
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

function calculatePaylineWin(symbols: string[], paylineNumber: number, betMultiplier: number): WinLine | null {
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
      const basePayout = symbolPaytable[count]
      const payout = basePayout * betMultiplier // Apply bet multiplier
      console.log(`    ${baseSymbol} forms valid win: ${count}x = ${basePayout} base * ${formatCurrency(betMultiplier)} bet = ${formatCurrency(payout)}`)
      
      // Keep track of the best (highest paying) combination
      if (!bestWin || payout > bestWin.payout) {
        bestWin = { symbol: baseSymbol, count, payout }
      }
    }
  }
  
  if (bestWin) {
    console.log(`    BEST WIN: ${bestWin.count}x ${bestWin.symbol} = ${formatCurrency(bestWin.payout)}`)
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

export async function POST(request: NextRequest) {
  try {
    loadGameData()
    
    // Parse request body to get bet amount
    const body = await request.json()
    const betAmount = body.bet || 1 // Default to 1 if no bet specified
    
    if (!virtualReels || !symbolMapping) {
      return NextResponse.json({ error: 'Game data not loaded' }, { status: 500 })
    }
    
    // Validate bet amount
    if (typeof betAmount !== 'number' || betAmount <= 0) {
      return NextResponse.json({ error: 'Invalid bet amount' }, { status: 400 })
    }
    
    // Check if player has sufficient funds
    if (!validateBalance(betAmount)) {
      const currentBalance = readWallet().balance
      return NextResponse.json({ 
        error: 'Insufficient funds',
        currentBalance,
        requiredAmount: betAmount
      }, { status: 400 })
    }
    
    // Deduct bet amount from wallet
    const walletAfterBet = deductBalance(betAmount)
    console.log(`Bet deducted: ${formatCurrency(betAmount)}, new balance: ${formatCurrency(walletAfterBet.balance)}`)
    
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
    
    // Calculate wins with expanded wilds and bet multiplier
    const { winLines, totalWin } = calculateWins(expandedResults, betAmount)
    
    // Add winnings to wallet if any
    let finalWallet = walletAfterBet
    if (totalWin > 0) {
      finalWallet = addBalance(totalWin)
      console.log(`Win added: ${formatCurrency(totalWin)}, new balance: ${formatCurrency(finalWallet.balance)}`)
    }
    
    // Add small delay to simulate server processing
    await new Promise(resolve => setTimeout(resolve, 100))
    
    return NextResponse.json({
      success: true,
      results,
      winLines,
      totalWin,
      expandedReels,
      balance: finalWallet.balance,
      timestamp: Date.now()
    })
    
  } catch (error) {
    console.error('Spin API error:', error)
    
    // Handle specific wallet errors
    if (error instanceof Error) {
      if (error.message === 'Insufficient funds') {
        return NextResponse.json({ 
          error: 'Insufficient funds',
          currentBalance: readWallet().balance
        }, { status: 400 })
      }
    }
    
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: 'Spin API - Use POST method to generate spin results',
    status: 'active' 
  })
}