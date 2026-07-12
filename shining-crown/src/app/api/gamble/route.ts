import { NextRequest, NextResponse } from 'next/server'
import { addBalance, deductBalance } from '../../../utils/wallet'

// POST /api/gamble - Process gamble win or loss
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, amount, metadata } = body

    // Validate input
    if (!type || !['win', 'loss'].includes(type)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid type. Must be "win" or "loss".'
        },
        { status: 400 }
      )
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid amount. Must be a positive number.'
        },
        { status: 400 }
      )
    }

    let updatedWallet

    if (type === 'win') {
      // Add gamble winnings to wallet
      updatedWallet = addBalance(amount, 'gamble_win', {
        ...metadata,
        description: `Gamble win: ${amount} MKD`
      })
    } else {
      // Deduct gamble loss from wallet
      // The initial win was already added to the wallet, so we need to deduct it when losing
      updatedWallet = deductBalance(amount, 'gamble_loss', {
        ...metadata,
        description: `Gamble loss: ${amount} MKD`
      })
    }

    return NextResponse.json({
      success: true,
      balance: updatedWallet.balance,
      currency: updatedWallet.currency,
      lastUpdated: updatedWallet.lastUpdated,
      type,
      amount
    })

  } catch (error) {
    console.error('Gamble transaction error:', error)

    // Handle specific error messages
    if (error instanceof Error) {
      return NextResponse.json(
        {
          success: false,
          error: error.message
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process gamble transaction'
      },
      { status: 500 }
    )
  }
}
