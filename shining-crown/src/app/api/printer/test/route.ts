import { NextRequest, NextResponse } from 'next/server'
import { testPrinter, getPrinterStatus } from '../../../../utils/thermalPrinter'
import { testRawPrinter } from '../../../../utils/rawPrinter'

// POST /api/printer/test - Test printer connection and print test receipt
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { useUSB = false } = body
    
    console.log(`Testing printer connection (USB: ${useUSB})...`)
    
    // Try node-thermal-printer first
    let testResult = await testPrinter(useUSB)
    
    if (!testResult.success) {
      console.log('📋 node-thermal-printer test failed, trying raw printing...')
      // Fallback to raw printing (your working terminal method)
      testResult = await testRawPrinter('STMicroelectronics_POS58_Printer_USB')
    }
    
    if (testResult.success) {
      return NextResponse.json({
        success: true,
        message: 'Test receipt printed successfully!',
        printer: {
          connected: true,
          type: 'STMicroelectronics POS58',
          method: testResult.error ? 'Raw printing (fallback)' : 'Standard library'
        }
      })
    } else {
      return NextResponse.json(
        {
          success: false,
          error: testResult.error,
          printer: {
            connected: false
          }
        },
        { status: 500 }
      )
    }
    
  } catch (error) {
    console.error('Printer test error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown printer error',
        printer: {
          connected: false
        }
      },
      { status: 500 }
    )
  }
}

// GET /api/printer/test - Get printer status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const useUSB = searchParams.get('usb') === 'true'
    
    const status = await getPrinterStatus(useUSB)
    
    return NextResponse.json({
      success: true,
      printer: status
    })
    
  } catch (error) {
    console.error('Printer status error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        printer: {
          connected: false
        }
      },
      { status: 500 }
    )
  }
}