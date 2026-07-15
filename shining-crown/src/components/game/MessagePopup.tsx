'use client'

import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react'

interface MessagePopupProps {
  isVisible: boolean
  type: 'success' | 'error' | 'info' | 'warning'
  title?: string
  message: string
  onClose: () => void
  autoCloseDelay?: number // milliseconds, 0 = manual close only
  // Passing onConfirm turns the popup into a confirmation dialog: it never
  // auto-closes, renders Confirm/Cancel, and commits on Enter.
  onConfirm?: () => void
  confirmLabel?: string
  cancelLabel?: string
}

export default function MessagePopup({
  isVisible,
  type,
  title,
  message,
  onClose,
  autoCloseDelay = 3000,
  onConfirm,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel'
}: MessagePopupProps) {
  const [isAnimating, setIsAnimating] = useState(false)
  const isConfirm = Boolean(onConfirm)
  // A confirmation must never disappear on its own
  const effectiveAutoCloseDelay = isConfirm ? 0 : autoCloseDelay

  useEffect(() => {
    if (isVisible) {
      setIsAnimating(true)

      // Auto-close after delay if specified
      if (effectiveAutoCloseDelay > 0) {
        const timer = setTimeout(() => {
          onClose()
        }, effectiveAutoCloseDelay)

        return () => clearTimeout(timer)
      }
    } else {
      setIsAnimating(false)
    }
  }, [isVisible, effectiveAutoCloseDelay, onClose])

  // Handle keyboard events (the cabinet has no pointer - Enter commits)
  useEffect(() => {
    if (!isVisible) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      } else if (isConfirm && event.key === 'Enter') {
        event.preventDefault()
        event.stopPropagation()
        onConfirm?.()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isVisible, onClose, onConfirm, isConfirm])

  if (!isVisible) return null

  // Get colors and icon based on type
  const getTypeStyles = () => {
    switch (type) {
      case 'success':
        return {
          bgColor: 'bg-green-900/95',
          borderColor: 'border-green-500',
          textColor: 'text-green-100',
          iconColor: 'text-green-400',
          icon: CheckCircle
        }
      case 'error':
        return {
          bgColor: 'bg-red-900/95',
          borderColor: 'border-red-500',
          textColor: 'text-red-100',
          iconColor: 'text-red-400',
          icon: XCircle
        }
      case 'warning':
        return {
          bgColor: 'bg-orange-900/95',
          borderColor: 'border-orange-500',
          textColor: 'text-orange-100',
          iconColor: 'text-orange-400',
          icon: AlertTriangle
        }
      case 'info':
      default:
        return {
          bgColor: 'bg-blue-900/95',
          borderColor: 'border-blue-500',
          textColor: 'text-blue-100',
          iconColor: 'text-blue-400',
          icon: Info
        }
    }
  }

  const styles = getTypeStyles()
  const IconComponent = styles.icon

  return (
    <div
      className={`
        fixed inset-0 z-50 flex items-center justify-center
        transition-all duration-300 ease-in-out
        ${isConfirm ? 'bg-black/60' : ''}
        ${isAnimating ? 'opacity-100' : 'opacity-0'}
      `}
      onClick={onClose}
    >

      <div 
        className={`
          relative min-w-96 max-w-lg mx-4 p-6 rounded-lg border-2 shadow-2xl
          transform transition-all duration-300 ease-in-out
          ${styles.bgColor} ${styles.borderColor} ${styles.textColor}
          ${isAnimating ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className={`
            absolute top-3 right-3 p-1 rounded-full transition-colors
            hover:bg-white/10 ${styles.iconColor}
          `}
          aria-label="Close message"
        >
          <X size={20} />
        </button>

        {/* Content */}
        <div className="flex items-start space-x-4">
          {/* Icon */}
          <div className={`flex-shrink-0 ${styles.iconColor}`}>
            <IconComponent size={32} />
          </div>

          {/* Text content */}
          <div className="flex-1 min-w-0">
            {title && (
              <h3 className="text-lg font-bold mb-2 pr-6">
                {title}
              </h3>
            )}
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {message}
            </p>
          </div>
        </div>

        {/* Confirmation actions */}
        {isConfirm && (
          <div className="mt-6 flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-lg border-2 border-white/30 text-sm font-bold transition-colors hover:bg-white/10"
            >
              {cancelLabel}
              <span className="ml-2 opacity-60 font-normal">ESC</span>
            </button>
            <button
              onClick={onConfirm}
              autoFocus
              className={`
                px-5 py-2 rounded-lg border-2 text-sm font-bold transition-colors
                ${styles.borderColor} ${styles.iconColor} hover:bg-white/10
              `}
            >
              {confirmLabel}
              <span className="ml-2 opacity-60 font-normal">ENTER</span>
            </button>
          </div>
        )}

        {/* Progress bar for auto-close */}
        {effectiveAutoCloseDelay > 0 && (
          <div className="mt-4 w-full bg-white/20 rounded-full h-1 overflow-hidden">
            <div 
              className={`
                h-full transition-all ease-linear
                ${type === 'success' ? 'bg-green-400' : 
                  type === 'error' ? 'bg-red-400' : 
                  type === 'warning' ? 'bg-orange-400' : 'bg-blue-400'}
              `}
              style={{
                width: '100%',
                animation: `shrink ${effectiveAutoCloseDelay}ms linear`
              }}
            />
          </div>
        )}
      </div>

      {/* Keyframes for progress bar animation */}
      <style jsx>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  )
}