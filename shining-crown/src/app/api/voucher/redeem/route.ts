import { NextRequest, NextResponse } from 'next/server'
import { addBalanceSync, enqueueMoneyOp } from '../../../../utils/wallet'
import { incrementMetersSync } from '../../../../utils/meters'

// POST /api/voucher/redeem - validate a voucher against the voucher server and
// credit the wallet in one server-side transaction. Replaces the old
// client-driven two-call flow (validate, then wallet add), which could
// validate a voucher and then fail to credit it.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { id } = body

    if (!id || typeof id !== 'string' || !/^[0-9]+$/.test(id) || id.length > 50) {
      return NextResponse.json(
        { success: false, error: 'Invalid voucher ID format' },
        { status: 400 }
      )
    }

    const voucherServerUrl = process.env.VOUCHER_SERVER_URL
    if (!voucherServerUrl) {
      return NextResponse.json(
        { success: false, error: 'Voucher server URL not configured' },
        { status: 500 }
      )
    }

    let data: { valid?: boolean; credit?: number; reason?: string }
    let status: number
    try {
      const voucherServerResponse = await fetch(`${voucherServerUrl}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      status = voucherServerResponse.status
      data = await voucherServerResponse.json()
    } catch (error) {
      console.error('Voucher server unreachable:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to connect to voucher server' },
        { status: 502 }
      )
    }

    if (!data.valid || typeof data.credit !== 'number' || data.credit <= 0) {
      return NextResponse.json(
        { success: false, error: data.reason || 'Invalid voucher' },
        { status: status >= 400 ? status : 400 }
      )
    }

    // Voucher server speaks denars; wallet and meters use deni
    const creditDeni = Math.round(data.credit * 100)

    const wallet = await enqueueMoneyOp(() => {
      const w = addBalanceSync(creditDeni, 'credit_add', {
        voucherId: id,
        type: 'voucher_redemption'
      })
      incrementMetersSync({ voucherIn: creditDeni })
      return w
    })

    console.log(`Voucher ${id} redeemed for ${creditDeni} deni, balance ${wallet.balance}`)

    return NextResponse.json({
      success: true,
      credit: creditDeni,
      balance: wallet.balance
    })
  } catch (error) {
    console.error('Voucher redeem error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to redeem voucher' },
      { status: 500 }
    )
  }
}
