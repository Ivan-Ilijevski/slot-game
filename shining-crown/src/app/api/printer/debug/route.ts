import { NextResponse } from 'next/server'

// GET /api/printer/debug - Debug printer connection and show available options
export async function GET() {
  try {
    console.log('🖨️ Starting enhanced POS58 printer debug...')
    
    // Import printer utilities
    const { ThermalPrinter, PrinterTypes, CharacterSet } = await import('node-thermal-printer')
    const { detectPOS58Printer, testPOS58Connection } = await import('../../../../utils/pos58Detector')
    
    const debugInfo: {
      timestamp: string
      platform: string
      arch: string
      nodeVersion: string
      printerTypes: string[]
      pos58Detection: any
      connectionTests: any[]
      attempts: any[]
      usbDevices?: any[]
      usbError?: string
    } = {
      timestamp: new Date().toISOString(),
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      printerTypes: Object.keys(PrinterTypes),
      pos58Detection: null,
      connectionTests: [],
      attempts: []
    }
    
    // Step 1: Detect POS58 printer
    console.log('🔍 Step 1: Detecting POS58 printer...')
    const pos58Info = await detectPOS58Printer()
    debugInfo.pos58Detection = pos58Info
    
    // Step 2: Test connections for detected printer
    if (pos58Info.found) {
      console.log('🧪 Step 2: Testing connection methods...')
      const connectionTests = await testPOS58Connection(pos58Info)
      debugInfo.connectionTests = connectionTests
    }
    
    // Test different printer configurations
    const testConfigs = [
      {
        name: 'USB Auto-detect',
        config: {
          type: PrinterTypes.EPSON,
          interface: 'usb',
          characterSet: CharacterSet.PC852_LATIN2,
          width: 32
        }
      },
      {
        name: 'Named Printer - POS-58',
        config: {
          type: PrinterTypes.EPSON,
          interface: 'printer:POS-58',
          characterSet: CharacterSet.PC852_LATIN2,
          width: 32
        }
      },
      {
        name: 'Named Printer - POS58',
        config: {
          type: PrinterTypes.EPSON,
          interface: 'printer:POS58',
          characterSet: CharacterSet.PC852_LATIN2,
          width: 32
        }
      },
      {
        name: 'Generic USB Receipt Printer',
        config: {
          type: PrinterTypes.EPSON,
          interface: 'printer:USB Receipt Printer',
          characterSet: CharacterSet.PC852_LATIN2,
          width: 32
        }
      },
      {
        name: 'Star Printer Type',
        config: {
          type: PrinterTypes.STAR,
          interface: 'usb',
          characterSet: CharacterSet.PC852_LATIN2,
          width: 32
        }
      }
    ]
    
    for (const testConfig of testConfigs) {
      console.log(`🖨️ Testing: ${testConfig.name}`)
      
      try {
        const printer = new ThermalPrinter(testConfig.config)
        const isConnected = await printer.isPrinterConnected()
        
        const result = {
          name: testConfig.name,
          config: testConfig.config,
          connected: isConnected,
          error: null
        }
        
        debugInfo.attempts.push(result)
        console.log(`🖨️ ${testConfig.name}: ${isConnected ? 'CONNECTED' : 'NOT CONNECTED'}`)
        
      } catch (error) {
        const result = {
          name: testConfig.name,
          config: testConfig.config,
          connected: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
        
        debugInfo.attempts.push(result)
        console.log(`🖨️ ${testConfig.name}: ERROR - ${result.error}`)
      }
    }
    
    // Check for USB devices (if possible)
    try {
      const usb = await import('usb')
      const devices = usb.getDeviceList()
      
      debugInfo.usbDevices = devices.map(device => ({
        vendorId: device.deviceDescriptor.idVendor,
        productId: device.deviceDescriptor.idProduct,
        deviceClass: device.deviceDescriptor.bDeviceClass,
        manufacturer: device.deviceDescriptor.iManufacturer,
        product: device.deviceDescriptor.iProduct
      }))
      
      console.log(`🖨️ Found ${devices.length} USB devices`)
      
    } catch (error) {
      debugInfo.usbError = error instanceof Error ? error.message : 'USB check failed'
      console.log('🖨️ USB device check failed:', debugInfo.usbError)
    }
    
    return NextResponse.json({
      success: true,
      debug: debugInfo,
      recommendations: [
        'Check if POS58 printer is powered on and connected via USB',
        'On Windows: Check Device Manager for "Printers" or "Unknown devices"',
        'On macOS: Check System Preferences > Printers & Scanners',
        'Try installing printer drivers if needed',
        'Ensure printer is set as default or properly named in system',
        'Check USB cable connection and try different USB port'
      ]
    })
    
  } catch (error) {
    console.error('🖨️ Debug error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Debug failed',
        message: 'Failed to debug printer connection'
      },
      { status: 500 }
    )
  }
}