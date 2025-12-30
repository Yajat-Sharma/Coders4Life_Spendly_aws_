import React, { useEffect, useRef, useState } from 'react'
import { Html5QrcodeScanner } from 'html5-qrcode'
import { X, Camera, AlertCircle, Loader2 } from 'lucide-react'

function QRScanner({ isOpen, onClose, onScan }) {
  const scannerRef = useRef(null)
  const [error, setError] = useState(null)
  const [isScanning, setIsScanning] = useState(false)
  const [permissionState, setPermissionState] = useState('checking') // checking, granted, denied, blocked
  const [isInitializing, setIsInitializing] = useState(false)

  // Check camera permissions and HTTPS
  const checkCameraSupport = async () => {
    try {
      // Check if we're on HTTPS (required for camera access)
      if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
        throw new Error('Camera access requires HTTPS. Please use a secure connection.')
      }

      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access is not supported on this browser.')
      }

      // Check camera permission
      const permission = await navigator.permissions.query({ name: 'camera' })
      
      if (permission.state === 'denied') {
        setPermissionState('denied')
        throw new Error('Camera permission denied. Please allow camera access and refresh the page.')
      } else if (permission.state === 'granted') {
        setPermissionState('granted')
      } else {
        setPermissionState('prompt')
      }

      return true
    } catch (err) {
      console.error('❌ Camera support check failed:', err)
      setError(err.message)
      setPermissionState('blocked')
      return false
    }
  }

  // Request camera permission explicitly
  const requestCameraPermission = async () => {
    try {
      setIsInitializing(true)
      setError(null)
      
      console.log('📷 Requesting camera permission...')
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment' // Prefer back camera
        } 
      })
      
      // Stop the stream immediately - we just needed permission
      stream.getTracks().forEach(track => track.stop())
      
      console.log('✅ Camera permission granted')
      setPermissionState('granted')
      return true
      
    } catch (err) {
      console.error('❌ Camera permission request failed:', err)
      
      if (err.name === 'NotAllowedError') {
        setError('Camera permission denied. Please allow camera access in your browser settings and refresh the page.')
        setPermissionState('denied')
      } else if (err.name === 'NotFoundError') {
        setError('No camera found on this device.')
        setPermissionState('blocked')
      } else if (err.name === 'NotSupportedError') {
        setError('Camera access is not supported on this browser.')
        setPermissionState('blocked')
      } else {
        setError(`Camera access failed: ${err.message}`)
        setPermissionState('blocked')
      }
      
      return false
    } finally {
      setIsInitializing(false)
    }
  }

  useEffect(() => {
    if (!isOpen) return

    let scanner = null
    let mounted = true

    const initScanner = async () => {
      try {
        setError(null)
        setIsScanning(false)
        setPermissionState('checking')

        // Check camera support first
        const isSupported = await checkCameraSupport()
        if (!isSupported || !mounted) return

        // Request permission if needed
        if (permissionState !== 'granted') {
          const hasPermission = await requestCameraPermission()
          if (!hasPermission || !mounted) return
        }

        console.log('📷 Initializing QR scanner...')
        setIsScanning(true)

        // Initialize scanner with production-ready config
        scanner = new Html5QrcodeScanner(
          "qr-reader",
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
            showTorchButtonIfSupported: true,
            showZoomSliderIfSupported: true,
            defaultZoomValueIfSupported: 2,
            rememberLastUsedCamera: true,
            supportedScanTypes: [Html5QrcodeScanner.SCAN_TYPE_CAMERA]
          },
          false
        )

        scanner.render(
          (decodedText, decodedResult) => {
            if (!mounted) return
            
            console.log('✅ QR Code scanned:', decodedText)
            
            // Parse UPI URL
            try {
              const upiData = parseUPIUrl(decodedText)
              if (upiData) {
                onScan(upiData)
                if (scanner) {
                  scanner.clear().catch(console.error)
                }
                onClose()
              } else {
                setError('Invalid QR code. Please scan a UPI payment QR code.')
              }
            } catch (err) {
              console.error('❌ QR parsing error:', err)
              setError('Failed to parse QR code data.')
            }
          },
          (errorMessage) => {
            // Ignore frequent scanning errors but log others
            if (!errorMessage.includes('No MultiFormat Readers') && 
                !errorMessage.includes('NotFoundException')) {
              console.log('QR scan error:', errorMessage)
            }
          }
        )

        console.log('✅ QR scanner initialized successfully')
        
      } catch (err) {
        console.error('❌ Scanner initialization error:', err)
        if (mounted) {
          setError(`Failed to initialize camera: ${err.message}`)
          setIsScanning(false)
        }
      }
    }

    initScanner()

    return () => {
      mounted = false
      if (scanner) {
        scanner.clear().catch(console.error)
      }
    }
  }, [isOpen, onScan, onClose])

  const parseUPIUrl = (url) => {
    try {
      // Handle both upi:// and plain text UPI IDs
      if (url.startsWith('upi://pay?')) {
        const urlObj = new URL(url)
        const params = urlObj.searchParams
        
        return {
          upiId: params.get('pa'),
          merchantName: params.get('pn') || 'Unknown Merchant',
          amount: params.get('am') || '',
          note: params.get('tn') || ''
        }
      } else if (url.includes('@')) {
        // Plain UPI ID
        return {
          upiId: url.trim(),
          merchantName: 'Scanned Merchant',
          amount: '',
          note: ''
        }
      }
      
      return null
    } catch (error) {
      console.error('❌ UPI URL parsing error:', error)
      return null
    }
  }

  const handleRetry = async () => {
    setError(null)
    setPermissionState('checking')
    
    // Re-check camera support
    const isSupported = await checkCameraSupport()
    if (isSupported && permissionState !== 'granted') {
      await requestCameraPermission()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-75 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2">
            <Camera className="h-5 w-5 text-primary-500" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Scan QR Code
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scanner */}
        <div className="p-4">
          {/* Permission/Loading States */}
          {(permissionState === 'checking' || isInitializing) && (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary-500 mx-auto mb-4" />
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {isInitializing ? 'Requesting camera permission...' : 'Checking camera support...'}
              </p>
            </div>
          )}

          {/* Permission Denied */}
          {permissionState === 'denied' && (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Camera Permission Denied
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Please allow camera access in your browser settings and refresh the page.
              </p>
              <button
                onClick={handleRetry}
                className="btn-primary"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Camera Blocked/Not Supported */}
          {permissionState === 'blocked' && (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Camera Not Available
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                {error || 'Camera access is not supported on this device or browser.'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Try using a different browser or device, or enter the UPI ID manually.
              </p>
            </div>
          )}

          {/* Scanner Active */}
          {permissionState === 'granted' && !isInitializing && (
            <>
              <div className="text-center mb-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Point your camera at a UPI QR code to scan
                </p>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-danger-50 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-800 rounded-lg">
                  <p className="text-sm text-danger-700 dark:text-danger-400">{error}</p>
                </div>
              )}

              <div 
                id="qr-reader" 
                className="w-full"
                style={{ minHeight: '300px' }}
              />

              <div className="mt-4 text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Make sure the QR code is well-lit and clearly visible
                </p>
                {location.protocol !== 'https:' && location.hostname !== 'localhost' && (
                  <p className="text-xs text-red-500 mt-2">
                    ⚠️ HTTPS required for camera access in production
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="btn-outline w-full"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default QRScanner