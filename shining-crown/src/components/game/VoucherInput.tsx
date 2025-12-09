'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface VoucherInputProps {
  onVoucherValidated?: (credit: number) => void
  onError?: (message: string) => void
  className?: string
}

export default function VoucherInput({ onVoucherValidated, onError, className = '' }: VoucherInputProps) {
  const [isScanning, setIsScanning] = useState(false)
  const [currentInput, setCurrentInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const inputTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handleVoucherSubmit = useCallback(async (voucherId: string) => {
    setIsProcessing(true)
    setCurrentInput('')

    try {
      const response = await fetch('/api/voucher/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: voucherId }),
      })

      const data = await response.json()

      if (response.ok && data.valid) {
        onVoucherValidated?.(data.credit)
        
        try {
          await fetch('/api/wallet', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
              operation: 'add', 
              amount: data.credit,
              metadata: { voucherId, type: 'voucher_redemption' }
            }),
          })
        } catch (walletError) {
          console.error('Failed to update wallet:', walletError)
          onError?.('Voucher validated but failed to update wallet')
        }
      } else {
        onError?.(data.reason || 'Invalid voucher')
      }
    } catch (error) {
      console.error('Voucher validation error:', error)
      onError?.('Failed to validate voucher')
    } finally {
      setIsProcessing(false)
    }
  }, [onVoucherValidated, onError])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isProcessing) return

      if (event.key === 'Enter') {
        if (currentInput.trim()) {
          handleVoucherSubmit(currentInput.trim())
        }
        return
      }

      if (event.key.length === 1 && /^[0-9]$/.test(event.key)) {
        setIsScanning(true)
        setCurrentInput(prev => prev + event.key)

        if (inputTimeoutRef.current) {
          clearTimeout(inputTimeoutRef.current)
        }

        inputTimeoutRef.current = setTimeout(() => {
          setIsScanning(false)
          if (currentInput) {
            setCurrentInput('')
          }
        }, 100)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (inputTimeoutRef.current) {
        clearTimeout(inputTimeoutRef.current)
      }
    }
  }, [currentInput, isProcessing, handleVoucherSubmit])

  return (
    <div className={`voucher-input ${className}`}>
      <div className="voucher-status">
        {isProcessing && (
          <div className="processing-indicator">
            <span>Processing voucher...</span>
          </div>
        )}
        {isScanning && !isProcessing && (
          <div className="scanning-indicator">
            <span>Scanning: {currentInput}</span>
          </div>
        )}
        {!isScanning && !isProcessing && (
          <div className="ready-indicator">
            <span>Ready to scan voucher</span>
          </div>
        )}
      </div>
    </div>
  )
}