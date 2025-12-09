import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { id } = body
    
    if (!id) {
      return NextResponse.json(
        { valid: false, reason: "Missing voucher ID" },
        { status: 400 }
      )
    }
    
    if (typeof id !== 'string' || !/^[0-9]+$/.test(id) || id.length > 50) {
      return NextResponse.json(
        { valid: false, reason: "Invalid voucher ID format" },
        { status: 400 }
      )
    }
    
    // Forward request to voucher server
    const voucherServerResponse = await fetch('http://localhost:8080/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id }),
    })
    
    const data = await voucherServerResponse.json()
    
    if (voucherServerResponse.ok) {
      return NextResponse.json(data)
    } else {
      return NextResponse.json(data, { status: voucherServerResponse.status })
    }
  } catch (error) {
    console.error('Voucher validation proxy error:', error)
    return NextResponse.json(
      { valid: false, reason: "Failed to connect to voucher server" },
      { status: 500 }
    )
  }
}