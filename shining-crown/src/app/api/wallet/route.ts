import { NextRequest, NextResponse } from 'next/server'
import { readWallet, updateBalance, validateBalance, WalletData } from '../../../utils/wallet'

// GET /api/wallet - Get current wallet balance
export async function GET() {
  try {
    const wallet = readWallet()
    
    return NextResponse.json({
      success: true,
      balance: wallet.balance,
      currency: wallet.currency,
      lastUpdated: wallet.lastUpdated
    })
  } catch (error) {
    console.error('Wallet GET error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to get wallet balance' 
      }, 
      { status: 500 }
    )
  }
}

// POST /api/wallet - Update wallet balance
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { amount, operation } = body
    
    // Validate input
    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid amount. Must be a positive number.' 
        }, 
        { status: 400 }
      )
    }
    
    if (!operation || !['add', 'deduct'].includes(operation)) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid operation. Must be "add" or "deduct".' 
        }, 
        { status: 400 }
      )
    }
    
    // Check sufficient funds for deduction
    if (operation === 'deduct' && !validateBalance(amount)) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Insufficient funds' 
        }, 
        { status: 400 }
      )
    }
    
    // Update balance
    const amountToUpdate = operation === 'add' ? amount : -amount
    const updatedWallet = updateBalance(amountToUpdate)
    
    return NextResponse.json({
      success: true,
      balance: updatedWallet.balance,
      currency: updatedWallet.currency,
      lastUpdated: updatedWallet.lastUpdated,
      operation,
      amount
    })
    
  } catch (error) {
    console.error('Wallet POST error:', error)
    
    // Handle specific error messages
    if (error instanceof Error) {
      if (error.message === 'Insufficient funds') {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Insufficient funds' 
          }, 
          { status: 400 }
        )
      }
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to update wallet balance' 
      }, 
      { status: 500 }
    )
  }
}