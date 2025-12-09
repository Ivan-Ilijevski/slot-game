import { exec } from 'child_process'
import { promisify } from 'util'
import { CashoutTicket } from './thermalPrinter'

const execAsync = promisify(exec)

// Format voucher ID for display (xx-xxxx-xxxx-xxxx-xxxx)
function formatVoucherId(voucherId: string): string {
  if (voucherId.length !== 18) {
    return voucherId // Return as-is if not expected length
  }
  
  return `${voucherId.slice(0, 2)}-${voucherId.slice(2, 6)}-${voucherId.slice(6, 10)}-${voucherId.slice(10, 14)}-${voucherId.slice(14, 18)}`
}

// Raw printing using macOS lp command (like your terminal command)
export async function printCashoutTicketRaw(
  ticketData: CashoutTicket,
  printerName: string = 'STMicroelectronics_POS58_Printer_USB'
): Promise<{ success: boolean; error?: string; ticketId: string }> {
  try {
    console.log(`🖨️ Raw printing to: ${printerName}`)
    
    // Build receipt content with ESC/POS commands
    const escCodes = {
      INIT: '\\x1B\\x40',              // ESC @ - Initialize
      CHARSET: '\\x1B\\x74\\x12',     // ESC t 18 - Set character set to PC852 (Latin2)
      CENTER: '\\x1B\\x61\\x01',      // ESC a 1 - Center alignment
      LEFT: '\\x1B\\x61\\x00',        // ESC a 0 - Left alignment
      BOLD_ON: '\\x1B\\x45\\x01',     // ESC E 1 - Bold on
      BOLD_OFF: '\\x1B\\x45\\x00',    // ESC E 0 - Bold off
      DOUBLE_HEIGHT: '\\x1B\\x21\\x10', // ESC ! 0x10 - Double height
      DOUBLE_SIZE: '\\x1B\\x21\\x30',   // ESC ! 0x30 - Double width & height
      NORMAL: '\\x1B\\x21\\x00',      // ESC ! 0x00 - Normal size
      CUT: '\\x1D\\x56\\x42\\x00',    // GS V B 0 - Cut paper
      NEWLINE: '\\x0A',               // Line feed
      DOUBLELINEFD: '\\x0A\\x0A'      // Double line feed
    }
    
    // Convert text to CP1251 encoding for Cyrillic support
    const convertText = (text: string): string => {
      // Note: In a real implementation, you'd convert UTF-8 to CP1251
      // For now, we'll use the text as-is since your terminal command worked
      return text
    }
    
    // Build receipt content
    const receiptLines = [
      // Initialize and set charset
      escCodes.INIT,
      escCodes.CHARSET,
      
      // Separator
      '================================',
      escCodes.NEWLINE,
      
      // Date and details
      escCodes.LEFT,
      convertText(`Date: ${ticketData.timestamp.toLocaleString()}`),
      escCodes.NEWLINE,
      convertText(`Machine: ${ticketData.machineId}`),
      escCodes.NEWLINE,
      convertText(`Ticket: #${ticketData.ticketId}`),
      escCodes.NEWLINE,
      
      // Separator
      '================================',
      escCodes.NEWLINE,
      
      // Cashout amount
      escCodes.CENTER,
      escCodes.BOLD_ON,
      escCodes.DOUBLE_SIZE,
      convertText('CASHOUT VOUCHER'),
      escCodes.NEWLINE,
      convertText(`${ticketData.amount.toFixed(2)} ${ticketData.currency}`),
      escCodes.NEWLINE,
      escCodes.BOLD_OFF,
      escCodes.NORMAL,
      
      // Voucher Code (if available)
      ...(ticketData.voucherId ? [
        escCodes.NEWLINE,
        escCodes.BOLD_ON,
        convertText('VOUCHER CODE:'),
        escCodes.NEWLINE,
        escCodes.DOUBLE_HEIGHT,
        convertText(formatVoucherId(ticketData.voucherId)),
        escCodes.NEWLINE,
        escCodes.BOLD_OFF,
        escCodes.NORMAL
      ] : []),
      
      // Separator
      '================================',
      escCodes.NEWLINE,
      
      // Instructions
      escCodes.CENTER,
      convertText('Valid for 30 days'),
      escCodes.NEWLINE,
      convertText('Present to cashier'),
      escCodes.NEWLINE,
      
      // Voucher QR code (if available)
      ...(ticketData.voucherId ? [
        escCodes.NEWLINE,
        convertText('SCAN TO REDEEM:'),
        escCodes.NEWLINE,
        generateQRCodeCommands(ticketData.voucherId),
        escCodes.NEWLINE,
      ] : []),
      
      
      // Footer
      '================================',
      escCodes.NEWLINE,
      convertText('Thank you for playing!'),
      escCodes.NEWLINE,
      convertText('Malfunction voids all pays'),
      escCodes.DOUBLELINEFD,
      escCodes.NEWLINE,
      escCodes.NEWLINE,
      // Cut paper
      escCodes.CUT
    ]
    
    // Join all parts
    const receiptContent = receiptLines.join('')
    
    // Create print command (similar to your terminal command)
    const printCommand = `printf '${receiptContent}' | lp -d "${printerName}" -o raw`
    
    console.log(`🖨️ Executing: ${printCommand}`)
    
    // Execute print command
    const { stdout, stderr } = await execAsync(printCommand)
    
    if (stderr && !stderr.includes('request id is')) {
      throw new Error(`Print command failed: ${stderr}`)
    }
    
    console.log(`✅ Print job submitted: ${stdout}`)
    
    return {
      success: true,
      ticketId: ticketData.ticketId
    }
    
  } catch (error) {
    console.error('❌ Raw printing failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Raw printing failed',
      ticketId: ticketData.ticketId
    }
  }
}

// Generate ESC/POS barcode commands for raw printing
function generateBarcodeCommands(ticketId: string): string {
  console.log(`🔍 RAW: generateBarcodeCommands called with ticketId: "${ticketId}" (length: ${ticketId.length})`)
  
  const commands = [
    // Switch to ASCII character set for barcode
    '\\x1B\\x74\\x00',  // ESC t 0 - ASCII character set
    // Set barcode height (162 dots ≈ 20mm)
    '\\x1D\\x68\\xA2',
    // Set barcode width (2 = medium)
    '\\x1D\\x77\\x02',
    // Print HRI below barcode
    '\\x1D\\x48\\x02',
    // Set HRI font
    '\\x1D\\x66\\x00',
    // Print UPC-A barcode (12 digits, no length byte needed)
    `\\x1D\\x6B\\x00${ticketId.slice(-12).padStart(12, '0')}`,
    // Switch back to Latin2 for text
    '\\x1B\\x74\\x12'   // ESC t 18 - PC852 (Latin2)
  ]
  
  const result = commands.join('')
  console.log(`🖨️ RAW: Generated barcode commands: ${result.substring(0, 100)}...`)
  return result
}

// Generate ESC/POS QR code commands for raw printing
function generateQRCodeCommands(ticketId: string): string {
  console.log(`🔍 RAW: generateQRCodeCommands called with ticketId: "${ticketId}" (length: ${ticketId.length})`)
  
  const dataLength = ticketId.length + 3
  
  const commands = [
    // QR Code model 2
    '\\x1D\\x28\\x6B\\x04\\x00\\x31\\x41\\x32\\x00',
    // Module size 8
    '\\x1D\\x28\\x6B\\x03\\x00\\x31\\x43\\x08',
    // Error correction level H (30% - highest error correction)
    '\\x1D\\x28\\x6B\\x03\\x00\\x31\\x45\\x33'
  ]
  
  // Store QR data - build with proper length encoding
  const storeCommand = '\\x1D\\x28\\x6B' + 
    '\\x' + (dataLength & 0xFF).toString(16).padStart(2, '0') + 
    '\\x' + ((dataLength >> 8) & 0xFF).toString(16).padStart(2, '0') + 
    '\\x31\\x50\\x30' + ticketId
  
  commands.push(storeCommand)
  
  // Print QR code
  commands.push('\\x1D\\x28\\x6B\\x03\\x00\\x31\\x51\\x30')
  
  return commands.join('')
}

// Test raw printing
export async function testRawPrinter(
  printerName: string = 'STMicroelectronics_POS58_Printer_USB'
): Promise<{ success: boolean; error?: string }> {
  try {
    const testTicketId = `TEST${Date.now().toString().slice(-6)}`
    
    // Test with barcode and QR code
    const testContent = [
      '\\x1B\\x40',  // Initialize
      '\\x1B\\x74\\x49',  // Set charset to Cyrillic
      '\\x1B\\x61\\x01',  // Center
      'TEST RECEIPT\\n',
      `Time: ${new Date().toLocaleString()}\\n`,
      '\\n',
      '\\n\\n\\n',
      'Large QR Code Test:\\n',
      generateQRCodeCommands(testTicketId),
      '\\n\\n',
      '\\x1D\\x56\\x42\\x00'  // Cut
    ].join('')
    
    const testCommand = `printf '${testContent}' | lp -d "${printerName}" -o raw`
    
    console.log(`🧪 Testing raw printer with barcode/QR: ${printerName}`)
    
    const { stdout, stderr } = await execAsync(testCommand)
    
    if (stderr && !stderr.includes('request id is')) {
      throw new Error(`Test print failed: ${stderr}`)
    }
    
    console.log(`✅ Test print with barcode/QR submitted: ${stdout}`)
    
    return { success: true }
    
  } catch (error) {
    console.error('❌ Raw printer test failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Raw test failed'
    }
  }
}