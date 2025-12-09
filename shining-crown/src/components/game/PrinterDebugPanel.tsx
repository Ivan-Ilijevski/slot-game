'use client'

import { useState } from 'react'
import { Printer, RefreshCw, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import MessagePopup from './MessagePopup'

export default function PrinterDebugPanel() {
  const [debugInfo, setDebugInfo] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showMessagePopup, setShowMessagePopup] = useState(false)
  const [messagePopupType, setMessagePopupType] = useState<'success' | 'error' | 'info' | 'warning'>('info')
  const [messagePopupTitle, setMessagePopupTitle] = useState<string>('')
  const [messagePopupMessage, setMessagePopupMessage] = useState<string>('')

  // Message popup helper
  const showMessage = (type: 'success' | 'error' | 'info' | 'warning', title: string, message: string) => {
    setMessagePopupType(type)
    setMessagePopupTitle(title)
    setMessagePopupMessage(message)
    setShowMessagePopup(true)
  }

  const runDebug = async () => {
    setIsLoading(true)
    try {
      // Use macOS-specific detection if on macOS
      const isMacOS = navigator.platform.toLowerCase().includes('mac')
      const endpoint = isMacOS ? '/api/printer/macos-detect' : '/api/printer/debug'
      
      const response = await fetch(endpoint)
      const data = await response.json()
      setDebugInfo(data)
    } catch (error) {
      setDebugInfo({
        success: false,
        error: 'Failed to run debug check'
      })
    }
    setIsLoading(false)
  }

  const testPrinter = async (configName: string, useUSB: boolean = false) => {
    try {
      const response = await fetch('/api/printer/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useUSB })
      })
      const data = await response.json()
      
      if (data.success) {
        showMessage('success', 'Test Successful', `${configName} test completed successfully! Check your printer for output.`)
      } else {
        showMessage('error', 'Test Failed', `${configName} test failed: ${data.error}`)
      }
    } catch (error) {
      showMessage('error', 'Test Error', `${configName} test error: Network error`)
    }
  }

  return (
    <div className="printer-debug-panel bg-gray-800 rounded-lg p-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
          <Printer size={24} />
          Printer Debug Panel
        </h3>
        <button
          onClick={runDebug}
          disabled={isLoading}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded flex items-center gap-2"
        >
          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          {isLoading ? 'Checking...' : 'Check Printers'}
        </button>
      </div>

      {debugInfo && (
        <div className="space-y-4">
          {/* System Info */}
          {debugInfo.debug && (
            <div className="bg-gray-700 rounded p-3">
              <h4 className="font-semibold text-white mb-2">System Information</h4>
              <div className="text-sm text-gray-300 grid grid-cols-2 gap-2">
                <div>Platform: {debugInfo.debug.platform}</div>
                <div>Architecture: {debugInfo.debug.arch}</div>
                <div>Node.js: {debugInfo.debug.nodeVersion}</div>
                <div>Timestamp: {new Date(debugInfo.debug.timestamp).toLocaleString()}</div>
              </div>
            </div>
          )}

          {/* macOS Detection Results */}
          {debugInfo.detection && (
            <>
              {/* System Printers */}
              {debugInfo.detection.systemPrinters && (
                <div className="bg-gray-700 rounded p-3">
                  <h4 className="font-semibold text-white mb-3">macOS System Printers</h4>
                  {debugInfo.detection.systemPrinters.length > 0 ? (
                    <div className="space-y-2">
                      {debugInfo.detection.systemPrinters.map((printer: string, index: number) => (
                        <div key={index} className="flex items-center justify-between bg-gray-600 rounded p-2">
                          <div className="flex items-center gap-2">
                            <Printer size={16} className="text-blue-400" />
                            <span className="text-white font-medium">{printer}</span>
                          </div>
                          <button
                            onClick={() => testPrinter(printer, false)}
                            className="bg-green-600 hover:bg-green-700 text-white text-xs px-2 py-1 rounded"
                          >
                            Test Print
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-gray-400">No system printers found</div>
                  )}
                </div>
              )}

              {/* Working Configuration */}
              {debugInfo.detection.workingConfig && (
                <div className="bg-gray-700 rounded p-3">
                  <h4 className="font-semibold text-white mb-3">Printer Configuration Test</h4>
                  <div className="bg-gray-600 rounded p-2">
                    <div className="flex items-center gap-2 mb-2">
                      {debugInfo.detection.workingConfig.success ? (
                        <CheckCircle size={16} className="text-green-400" />
                      ) : (
                        <XCircle size={16} className="text-red-400" />
                      )}
                      <span className="text-white font-medium">
                        {debugInfo.detection.workingConfig.success 
                          ? `Working: ${debugInfo.detection.workingConfig.configName}`
                          : 'No working configuration found'
                        }
                      </span>
                    </div>
                    {debugInfo.detection.workingConfig.success && (
                      <button
                        onClick={() => testPrinter(debugInfo.detection.workingConfig.configName, false)}
                        className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1 rounded"
                      >
                        Test Working Config
                      </button>
                    )}
                    {debugInfo.detection.workingConfig.error && (
                      <div className="text-red-300 text-sm mt-1">
                        Error: {debugInfo.detection.workingConfig.error}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Printer Test Results (fallback for non-macOS) */}
          {debugInfo.debug?.attempts && (
            <div className="bg-gray-700 rounded p-3">
              <h4 className="font-semibold text-white mb-3">Printer Connection Tests</h4>
              <div className="space-y-2">
                {debugInfo.debug.attempts.map((attempt: any, index: number) => (
                  <div key={index} className="flex items-center justify-between bg-gray-600 rounded p-2">
                    <div className="flex items-center gap-2">
                      {attempt.connected ? (
                        <CheckCircle size={16} className="text-green-400" />
                      ) : (
                        <XCircle size={16} className="text-red-400" />
                      )}
                      <span className="text-white font-medium">{attempt.name}</span>
                      {attempt.error && (
                        <span className="text-red-300 text-sm">({attempt.error})</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => testPrinter(attempt.name, attempt.config.interface === 'usb')}
                        className="bg-green-600 hover:bg-green-700 text-white text-xs px-2 py-1 rounded"
                      >
                        Test Print
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* USB Devices */}
          {debugInfo.debug?.usbDevices && (
            <div className="bg-gray-700 rounded p-3">
              <h4 className="font-semibold text-white mb-3">USB Devices Detected</h4>
              {debugInfo.debug.usbDevices.length > 0 ? (
                <div className="space-y-2">
                  {debugInfo.debug.usbDevices.map((device: any, index: number) => (
                    <div key={index} className="bg-gray-600 rounded p-2 text-sm">
                      <div className="text-white">
                        Vendor ID: 0x{device.vendorId?.toString(16)?.padStart(4, '0') || 'Unknown'} | 
                        Product ID: 0x{device.productId?.toString(16)?.padStart(4, '0') || 'Unknown'}
                      </div>
                      <div className="text-gray-300">
                        Class: {device.deviceClass || 'Unknown'} | 
                        Manufacturer: {device.manufacturer || 'Unknown'} | 
                        Product: {device.product || 'Unknown'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-400">No USB devices detected</div>
              )}
            </div>
          )}

          {/* Recommendations */}
          {debugInfo.recommendations && (
            <div className="bg-yellow-900/30 border border-yellow-600 rounded p-3">
              <h4 className="font-semibold text-yellow-400 mb-2 flex items-center gap-2">
                <AlertTriangle size={16} />
                Troubleshooting Steps
              </h4>
              <ul className="text-yellow-200 text-sm space-y-1">
                {debugInfo.recommendations.map((rec: string, index: number) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="text-yellow-400 mt-1">•</span>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Manual Test Buttons */}
          <div className="bg-gray-700 rounded p-3">
            <h4 className="font-semibold text-white mb-3">Manual Tests</h4>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => testPrinter('USB Auto-detect', true)}
                className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded text-sm"
              >
                Test USB Auto-detect
              </button>
              <button
                onClick={() => testPrinter('Named Printer', false)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded text-sm"
              >
                Test Named Printer
              </button>
            </div>
          </div>
        </div>
      )}

      {!debugInfo && !isLoading && (
        <div className="text-center text-gray-400 py-8">
          Click "Check Printers" to diagnose your POS58 printer connection
        </div>
      )}
      
      <MessagePopup
        isVisible={showMessagePopup}
        type={messagePopupType}
        title={messagePopupTitle}
        message={messagePopupMessage}
        onClose={() => setShowMessagePopup(false)}
        autoCloseDelay={4000}
      />
    </div>
  )
}