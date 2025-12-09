// Voucher Generation Utility
// Connects to voucher server on port 8080 to generate voucher codes

export interface VoucherGenerationResponse {
  success: boolean
  id?: string // Generated voucher ID
  message?: string // Error message if failed
}

/**
 * Generate a voucher code by calling the voucher server
 * @param credit - Amount in MKD to create voucher for
 * @returns Promise with voucher generation result
 */
export async function generateVoucher(credit: number): Promise<VoucherGenerationResponse> {
  try {
    console.log(`🎫 Generating voucher for ${credit} MKD...`)
    
    // Validate credit amount
    if (typeof credit !== 'number' || credit <= 0) {
      return {
        success: false,
        message: 'Invalid credit amount. Must be a positive number.'
      }
    }
    
    // Get API key from environment
    const apiKey = process.env.VOUCHER_API_KEY
    if (!apiKey) {
      return {
        success: false,
        message: 'Voucher API key not configured. Please set VOUCHER_API_KEY environment variable.'
      }
    }
    
    // Make request to voucher server
    const response = await fetch('http://localhost:8080/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({ credit }),
      signal: AbortSignal.timeout(10000) // 10 second timeout
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      
      if (response.status === 403) {
        return {
          success: false,
          message: 'Unauthorized - Invalid API key'
        }
      }
      
      return {
        success: false,
        message: errorData.message || `Server error: ${response.status}`
      }
    }
    
    const data = await response.json()
    
    if (data.success && data.id) {
      console.log(`✅ Voucher generated successfully: ${data.id}`)
      return {
        success: true,
        id: data.id
      }
    } else {
      return {
        success: false,
        message: data.message || 'Failed to generate voucher'
      }
    }
    
  } catch (error) {
    console.error('🚨 Voucher generation error:', error)
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return {
          success: false,
          message: 'Voucher generation timed out'
        }
      }
      
      if (error.message.includes('ECONNREFUSED')) {
        return {
          success: false,
          message: 'Cannot connect to voucher server. Please check if server is running on port 8080.'
        }
      }
      
      return {
        success: false,
        message: error.message
      }
    }
    
    return {
      success: false,
      message: 'Unknown error occurred during voucher generation'
    }
  }
}