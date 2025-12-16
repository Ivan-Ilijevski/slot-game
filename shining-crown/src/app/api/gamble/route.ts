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
      // Deduct gamble loss from wallet (the amount was already in pending win, not in wallet)
      // So we don't actually deduct here - the loss is that we don't add the pending win
      // But we log it as a loss transaction with 0 wallet impact
      const { readWallet } = await import('../../../utils/wallet')
      const wallet = readWallet()

      // Log the gamble loss without changing balance (since pending win was never added)
      const { logTransaction } = await import('../../../utils/transactionLogger')
      logTransaction('gamble_loss', -amount, wallet.balance, wallet.balance, {
        ...metadata,
        description: `Gamble loss: ${amount} MKD`
      })

      updatedWallet = wallet
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
