import { NextRequest, NextResponse } from 'next/server'
import { readWallet, updateBalanceSync, enqueueMoneyOp } from '../../../utils/wallet'
import { incrementMetersSync } from '../../../utils/meters'
import { printCashoutTicket, generateTicketId, CashoutTicket } from '../../../utils/thermalPrinter'
import { printCashoutTicketRaw } from '../../../utils/rawPrinter'
import { generateVoucher } from '../../../utils/voucherGenerator'
import { isSessionActive } from '../../../lib/gambleSession'
import { getSasService } from '../../../lib/sas/singleton'
import { SAS_CONSTANTS } from '../../../lib/sas/sasConfig'

// Response for a cash-out that was paid to the player's card via SAS AFT.
// The AFT engine has already debited the wallet, metered aftOut, and queued
// the 0x69 completion exception.
function cardPayoutResponse(previousBalance: number, machineId: string) {
  const after = readWallet()
  return NextResponse.json({
    success: true,
    method: 'aft',
    cashout: {
      amount: previousBalance,
      currency: after.currency,
      timestamp: new Date().toISOString(),
      machineId
    },
    balance: {
      previous: previousBalance,
      current: after.balance,
      currency: after.currency
    }
  })
}

// POST /api/cashout - Process cashout and print ticket
export async function POST(request: NextRequest) {
  try {
    if (isSessionActive()) {
      return NextResponse.json({ success: false, error: 'Gamble in progress' }, { status: 409 })
    }

    const body = await request.json()
    const { amount, useUSB = false, machineId = 'SHINING-CROWN-001' } = body

    // Validate amount (integer deni)
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid cashout amount. Must be a positive integer deni amount.'
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
    const minCashout = 1000 // Minimum 10.00 MKD, in deni
    if (amount < minCashout) {
      return NextResponse.json(
        {
          success: false,
          error: `Minimum cashout amount is ${minCashout / 100} ${wallet.currency}.`
        },
        { status: 400 }
      )
    }

    const sas = getSasService()

    // Reject the button press if the machine is already locked for a transfer.
    if (sas.isLockedForPlay()) {
      return NextResponse.json({ success: false, error: 'Machine locked for transfer' }, { status: 409 })
    }

    // Full-balance cash-out with the SAS link up: offer it to the host first
    // (credits go to the player's card via AFT). The host pulls the whole
    // balance, so only a full-balance request can ride AFT; partial amounts and
    // link-down go straight to the voucher.
    let latchArmed = false
    if (amount === wallet.balance && sas.isLinkUp()) {
      latchArmed = true
      const result = await sas.requestHostCashout(amount, SAS_CONSTANTS.hostCashoutWindowMs)
      if (result === 'aft') {
        sas.releaseCashout()
        return cardPayoutResponse(wallet.balance, machineId)
      }
      // Window expired: commit to voucher (refuses any late transfer). If the
      // host pulled the credits at the last moment, the balance is now short.
      const committedBalance = await sas.commitVoucherCashout()
      if (committedBalance < amount) {
        sas.releaseCashout()
        return cardPayoutResponse(wallet.balance, machineId)
      }
    }

    // Note: Cashout notifications are now handled by the tablet interface

    // Generate voucher code from server (voucher server speaks denars)
    console.log('🎫 Generating voucher code...')
    const voucherResult = await generateVoucher(amount / 100)
    
    if (!voucherResult.success) {
      // Note: Cashout failure notification will be handled by tablet based on API response
      if (latchArmed) sas.releaseCashout()
      return NextResponse.json(
        {
          success: false,
          error: `Voucher generation failed: ${voucherResult.message}`,
          voucherError: true
        },
        { status: 500 }
      )
    }
    
    // Generate ticket ID for internal tracking
    const ticketId = generateTicketId()
    const timestamp = new Date()
    
    // Prepare ticket data (printers format denars, not deni)
    const ticketData: CashoutTicket = {
      amount: amount / 100,
      currency: wallet.currency,
      ticketId,
      voucherId: voucherResult.id, // Add voucher ID from server
      machineId,
      timestamp,
      balanceAfter: (wallet.balance - amount) / 100
    }
    
    // Try printing with node-thermal-printer first, then fallback to raw printing
    console.log('🖨️ Attempting thermal printer first...')
    let printResult = await printCashoutTicket(ticketData, useUSB)
    
    if (!printResult.success) {
      console.log('📋 node-thermal-printer failed, trying raw printing...')
      console.log('🖨️ Fallback to raw printing with lp command')
      // Fallback to raw printing (like your terminal command)
      printResult = await printCashoutTicketRaw(ticketData, 'STMicroelectronics_POS58_Printer_USB')
    } else {
      console.log('✅ Thermal printer succeeded')
    }
    
    if (!printResult.success) {
      // Note: Cashout failure notification will be handled by tablet based on API response
      if (latchArmed) sas.releaseCashout()
      return NextResponse.json(
        {
          success: false,
          error: `Printer error: ${printResult.error}`,
          printerError: true
        },
        { status: 500 }
      )
    }
    
    // Deduct amount and advance the voucher-out meter atomically
    const updatedWallet = await enqueueMoneyOp(() => {
      const wallet = updateBalanceSync(-amount, 'cashout', {
        ticketId,
        voucherId: voucherResult.id,
        machineId,
        printedAt: timestamp.toISOString()
      })
      incrementMetersSync({ voucherOut: amount })
      return wallet
    })
    
    console.log(`Cashout processed: ${amount} ${wallet.currency}, Ticket: ${ticketId}`)

    // Voucher printed and balance debited: release the cashout latch.
    if (latchArmed) sas.releaseCashout()

    // Note: Cashout success notification will be handled by tablet based on API response

    return NextResponse.json({
      success: true,
      method: 'voucher',
      cashout: {
        amount,
        currency: wallet.currency,
        ticketId,
        voucherId: voucherResult.id,
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
      },
      voucher: {
        id: voucherResult.id,
        formatted: voucherResult.id ? `${voucherResult.id.slice(0, 2)}-${voucherResult.id.slice(2, 6)}-${voucherResult.id.slice(6, 10)}-${voucherResult.id.slice(10, 14)}-${voucherResult.id.slice(14, 18)}` : '',
        redeemable: true
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
        minAmount: 1000, // Minimum cashout in deni (10.00 MKD)
        maxAmount: wallet.balance, // Maximum is current balance
        available: wallet.balance >= 1000
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
