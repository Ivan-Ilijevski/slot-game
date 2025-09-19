import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// GET /api/printer/macos-detect - Detect printers on macOS without problematic USB packages
export async function GET() {
  try {
    console.log('🍎 Starting macOS printer detection...')
    
    const results: any = {
      timestamp: new Date().toISOString(),
      platform: 'macOS',
      systemPrinters: [],
      usbDevices: [],
      printerConfigs: [],
      workingConfig: null
    }
    
    // Step 1: Get system printers via lpstat
    try {
      console.log('📋 Checking system printers...')
      const { stdout: lpstatOutput } = await execAsync('lpstat -p')
      const printers = lpstatOutput.split('\n')
        .filter(line => line.startsWith('printer'))
        .map(line => line.replace('printer ', '').split(' ')[0])
      
      results.systemPrinters = printers
      console.log(`Found ${printers.length} system printers:`, printers)
    } catch (error) {
      console.log('❌ Failed to get system printers:', error)
      results.systemPrinters = []
    }
    
    // Step 2: Check USB devices via system_profiler
    try {
      console.log('🔍 Checking USB devices...')
      const { stdout: usbOutput } = await execAsync('system_profiler SPUSBDataType -json')
      const usbData = JSON.parse(usbOutput)
      
      const usbDevices: any[] = []
      
      // Parse USB tree
      function parseUSBItems(items: any[]) {
        for (const item of items) {
          if (item.vendor_id && item.product_id) {
            usbDevices.push({
              name: item._name || 'Unknown',
              vendorId: item.vendor_id,
              productId: item.product_id,
              manufacturer: item.manufacturer || item.vendor_id,
              location: item.location_id
            })
          }
          if (item._items) {
            parseUSBItems(item._items)
          }
        }
      }
      
      if (usbData.SPUSBDataType?.[0]?._items) {
        parseUSBItems(usbData.SPUSBDataType[0]._items)
      }
      
      results.usbDevices = usbDevices
      console.log(`Found ${usbDevices.length} USB devices`)
      
      // Look for potential printers
      const printerLikeDevices = usbDevices.filter(device => 
        device.name.toLowerCase().includes('printer') ||
        device.name.toLowerCase().includes('pos') ||
        device.name.toLowerCase().includes('thermal') ||
        device.manufacturer?.toLowerCase().includes('printer')
      )
      
      console.log(`Found ${printerLikeDevices.length} printer-like USB devices:`, printerLikeDevices)
      
    } catch (error) {
      console.log('❌ Failed to get USB devices:', error)
      results.usbDevices = []
    }
    
    // Step 3: Test thermal printer configurations
    try {
      console.log('🧪 Testing thermal printer configurations...')
      const { findWorkingPrinterConfig } = await import('../../../../utils/thermalPrinter')
      
      const workingConfig = await findWorkingPrinterConfig()
      results.workingConfig = workingConfig
      
      if (workingConfig.success) {
        console.log(`✅ Found working printer configuration: ${workingConfig.configName}`)
      } else {
        console.log('❌ No working printer configuration found')
      }
      
    } catch (error) {
      console.log('❌ Failed to test printer configurations:', error)
      results.workingConfig = {
        success: false,
        error: error instanceof Error ? error.message : 'Configuration test failed'
      }
    }
    
    return NextResponse.json({
      success: true,
      detection: results,
      recommendations: [
        'Check if your POS58 printer appears in System Printers list',
        'If not in system printers, try: System Preferences → Printers & Scanners → Add Printer',
        'Look for USB devices that might be your POS58 printer',
        'Try the working configuration if one was found',
        'On macOS, printers often need to be added to system before use'
      ]
    })
    
  } catch (error) {
    console.error('🚨 macOS detection error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Detection failed',
        message: 'Failed to detect printers on macOS'
      },
      { status: 500 }
    )
  }
}