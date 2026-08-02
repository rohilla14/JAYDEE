import { useEffect, useRef, useState } from 'react'

type BarcodeScannerProps = {
  onDetected: (barcode: string) => void
  onCancel: () => void
  onError: (message: string) => void
}

export function isBarcodeDetectorSupported(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window
}

export function BarcodeScanner({
  onDetected,
  onCancel,
  onError,
}: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let stream: MediaStream | null = null
    let rafId = 0
    let detector: BarcodeDetector | null = null

    async function start() {
      if (!window.BarcodeDetector) {
        onError('Camera scanning not supported on this device — enter barcode manually')
        return
      }

      try {
        detector = new window.BarcodeDetector({
          formats: [
            'ean_13',
            'ean_8',
            'upc_a',
            'upc_e',
            'code_128',
            'code_39',
            'qr_code',
          ],
        })
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
          },
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        const video = videoRef.current
        if (!video) {
          return
        }
        video.srcObject = stream
        await video.play()

        const tick = async () => {
          if (cancelled || !detector || !videoRef.current) {
            return
          }
          try {
            const codes = await detector.detect(videoRef.current)
            if (codes.length > 0 && codes[0].rawValue) {
              onDetected(codes[0].rawValue)
              return
            }
          } catch {
            // Frame may not be ready yet; keep scanning.
          }
          rafId = window.setTimeout(() => {
            void tick()
          }, 250)
        }
        void tick()
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Could not open the camera'
        setCameraError(message)
        onError(message)
      }
    }

    void start()

    return () => {
      cancelled = true
      window.clearTimeout(rafId)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [onDetected, onCancel, onError])

  return (
    <div className="scanner">
      {cameraError ? (
        <p className="error" role="alert">
          {cameraError}
        </p>
      ) : (
        <video ref={videoRef} className="scanner-video" playsInline muted />
      )}
      <button type="button" className="secondary" onClick={onCancel}>
        Cancel scan
      </button>
    </div>
  )
}
