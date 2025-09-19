// POS58 USB Detection Utility
// Common POS58 Vendor/Product IDs

export interface USBPrinterInfo {
  vendorId: number
  productId: number
  manufacturer?: string
  product?: string
  found: boolean
  devicePath?: string
}

// Common POS58 USB identifiers
const KNOWN_POS58_IDS = [
  { vendorId: 0x0fe6, productId: 0x811e, name: 'POS58 Thermal Printer' },
  { vendorId: 0x04b8, productId: 0x0202, name: 'Epson Compatible POS58' },
  { vendorId: 0x04b8, productId: 0x0005, name: 'Epson TM Series' },
  { vendorId: 0x0483, productId: 0x5720, name: 'Generic POS58' },
  { vendorId: 0x1fc9, productId: 0x2016, name: 'Zjiang POS58' },
  { vendorId: 0x28e9, productId: 0x0289, name: 'Zonerich POS58' },
  { vendorId: 0x1659, productId: 0x8965, name: 'iMin POS58' }
]

// Detect POS58 printer via USB
export async function detectPOS58Printer(): Promise<USBPrinterInfo> {
  try {
    // Try to import USB module
    const usb = await import('usb')
    const devices = usb.getDeviceList()
    
    console.log(`🔍 Scanning ${devices.length} USB devices for POS58 printer...`)
    
    for (const device of devices) {
      const desc = device.deviceDescriptor
      const vendorId = desc.idVendor
      const productId = desc.idProduct
      
      console.log(`📱 Device: VID=0x${vendorId.toString(16).padStart(4, '0')}, PID=0x${productId.toString(16).padStart(4, '0')}`)
      
      // Check against known POS58 identifiers
      const knownDevice = KNOWN_POS58_IDS.find(known => 
        known.vendorId === vendorId && known.productId === productId
      )
      
      if (knownDevice) {
        console.log(`✅ Found known POS58: ${knownDevice.name}`)
        
        return {
          vendorId,
          productId,
          manufacturer: knownDevice.name,
          product: knownDevice.name,
          found: true,
          devicePath: `USB\\VID_${vendorId.toString(16).padStart(4, '0')}&PID_${productId.toString(16).padStart(4, '0')}`
        }
      }
      
      // Check for printer class devices (class 7)
      if (desc.bDeviceClass === 7) {
        console.log(`🖨️ Found printer device: VID=0x${vendorId.toString(16)}, PID=0x${productId.toString(16)}`)
        
        return {
          vendorId,
          productId,
          manufacturer: 'Unknown Printer',
          product: 'USB Thermal Printer',
          found: true,
          devicePath: `USB\\VID_${vendorId.toString(16).padStart(4, '0')}&PID_${productId.toString(16).padStart(4, '0')}`
        }
      }
    }
    
    console.log('❌ No POS58 or thermal printer found')
    return {
      vendorId: 0,
      productId: 0,
      found: false
    }
    
  } catch (error) {
    console.error('🚨 USB detection error:', error)
    return {
      vendorId: 0,
      productId: 0,
      found: false
    }
  }
}

// Try different connection methods for detected printer
export async function testPOS58Connection(printerInfo: USBPrinterInfo): Promise<{
  method: string
  success: boolean
  error?: string
}[]> {
  const results = []
  
  if (!printerInfo.found) {
    return [{
      method: 'detection',
      success: false,
      error: 'No POS58 printer detected'
    }]
  }
  
  // Import thermal printer
  const { ThermalPrinter, PrinterTypes, CharacterSet } = await import('node-thermal-printer')
  
  // Test Method 1: Direct USB
  try {
    console.log('🧪 Testing direct USB connection...')
    const usbPrinter = new ThermalPrinter({
      type: PrinterTypes.EPSON,
      interface: 'usb',
      characterSet: CharacterSet.PC852_LATIN2,
      width: 32
    })
    
    const connected = await usbPrinter.isPrinterConnected()
    results.push({
      method: 'Direct USB',
      success: connected,
      error: connected ? undefined : 'USB connection failed'
    })
    
  } catch (error) {
    results.push({
      method: 'Direct USB',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown USB error'
    })
  }
  
  // Test Method 2: Serial port (if available)
  try {
    console.log('🧪 Testing serial port connection...')
    
    // Try to detect serial ports
    const { SerialPort } = await import('serialport')
    const ports = await SerialPort.list()
    
    const usbSerialPort = ports.find(port => 
      port.vendorId === printerInfo.vendorId.toString(16).padStart(4, '0').toUpperCase() ||
      port.productId === printerInfo.productId.toString(16).padStart(4, '0').toUpperCase() ||
      port.manufacturer?.toLowerCase().includes('pos') ||
      port.manufacturer?.toLowerCase().includes('printer')
    )
    
    if (usbSerialPort) {
      console.log(`📡 Found serial port: ${usbSerialPort.path}`)
      
      const serialPrinter = new ThermalPrinter({
        type: PrinterTypes.EPSON,
        interface: usbSerialPort.path,
        characterSet: CharacterSet.PC852_LATIN2,
        width: 32,
        options: {
          timeout: 5000
        }
      })
      
      const connected = await serialPrinter.isPrinterConnected()
      results.push({
        method: `Serial: ${usbSerialPort.path}`,
        success: connected,
        error: connected ? undefined : 'Serial connection failed'
      })
    } else {
      results.push({
        method: 'Serial Port',
        success: false,
        error: 'No matching serial port found'
      })
    }
    
  } catch (error) {
    results.push({
      method: 'Serial Port',
      success: false,
      error: error instanceof Error ? error.message : 'Serial detection failed'
    })
  }
  
  return results
}