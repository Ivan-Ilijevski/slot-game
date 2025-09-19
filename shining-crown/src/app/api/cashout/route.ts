import { NextRequest, NextResponse } from 'next/server'
import { readWallet, updateBalance } from '../../../utils/wallet'
import { printCashoutTicket, generateTicketId, CashoutTicket } from '../../../utils/thermalPrinter'
import { printCashoutTicketRaw } from '../../../utils/rawPrinter'

// POST /api/cashout - Process cashout and print ticket
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { amount, useUSB = false, machineId = 'SHINING-CROWN-001' } = body
    
    // Validate amount
    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid cashout amount. Must be a positive number.' 
        }, 
        { status: 400 }
      )
    }
    
    // Check if amount is reasonable (not more than balance)
    const wallet = readWallet()
    if (amount > wallet.balance) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Cashout amount exceeds current balance.' 
        }, 
        { status: 400 }
      )
    }
    
    // Minimum cashout validation (optional)
    const minCashout = 10 // Minimum 10 MKD
    if (amount < minCashout) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Minimum cashout amount is ${minCashout} ${wallet.currency}.` 
        }, 
        { status: 400 }
      )
    }
    
    // Generate ticket ID
    const ticketId = generateTicketId()
    const timestamp = new Date()
    
    // Prepare ticket data
    const ticketData: CashoutTicket = {
      amount,
      currency: wallet.currency,
      ticketId,
      machineId,
      timestamp,
      balanceAfter: wallet.balance - amount
    }
    
    // Try printing with node-thermal-printer first, then fallback to raw printing
    let printResult = await printCashoutTicket(ticketData, useUSB)
    
    if (!printResult.success) {
      console.log('📋 node-thermal-printer failed, trying raw printing...')
      // Fallback to raw printing (like your terminal command)
      printResult = await printCashoutTicketRaw(ticketData, 'STMicroelectronics_POS58_Printer_USB')
    }
    
    if (!printResult.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Printer error: ${printResult.error}`,
          printerError: true
        }, 
        { status: 500 }
      )
    }
    
    // Deduct amount from balance (with transaction logging)
    const updatedWallet = updateBalance(-amount, 'cashout', {
      ticketId,
      machineId,
      printedAt: timestamp.toISOString()
    })
    
    console.log(`Cashout processed: ${amount} ${wallet.currency}, Ticket: ${ticketId}`)
    
    return NextResponse.json({
      success: true,
      cashout: {
        amount,
        currency: wallet.currency,
        ticketId,
        timestamp: timestamp.toISOString(),
        machineId
      },
      balance: {
        previous: wallet.balance,
        current: updatedWallet.balance,
        currency: updatedWallet.currency
      },
      printer: {
        success: true,
        ticketPrinted: true
      }
    })
    
  } catch (error) {
    console.error('Cashout error:', error)
    
    // Handle specific error messages
    if (error instanceof Error) {
      if (error.message === 'Insufficient funds') {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Insufficient funds for cashout.' 
          }, 
          { status: 400 }
        )
      }
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to process cashout. Please try again.' 
      }, 
      { status: 500 }
    )
  }
}

// GET /api/cashout - Get cashout information and printer status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const checkPrinter = searchParams.get('printer') === 'true'
    const useUSB = searchParams.get('usb') === 'true'
    
    const wallet = readWallet()
    
    const response: {
      success: boolean
      wallet: {
        balance: number
        currency: string
      }
      cashout: {
        minAmount: number
        maxAmount: number
        available: boolean
      }
      printer?: {
        connected: boolean
        error?: string
      }
    } = {
      success: true,
      wallet: {
        balance: wallet.balance,
        currency: wallet.currency
      },
      cashout: {
        minAmount: 10, // Minimum cashout
        maxAmount: wallet.balance, // Maximum is current balance
        available: wallet.balance >= 10
      }
    }
    
    // Check printer status if requested
    if (checkPrinter) {
      try {
        const { getPrinterStatus } = await import('../../../utils/thermalPrinter')
        const printerStatus = await getPrinterStatus(useUSB)
        response.printer = printerStatus
      } catch {
        response.printer = {
          connected: false,
          error: 'Printer check failed'
        }
      }
    }
    
    return NextResponse.json(response)
    
  } catch (error) {
    console.error('Cashout GET error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to get cashout information.' 
      }, 
      { status: 500 }
    )
  }
}