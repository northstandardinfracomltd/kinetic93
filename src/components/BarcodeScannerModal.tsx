import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (decodedText: string) => void;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({ isOpen, onClose, onScanSuccess }) => {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onScanSuccessRef = useRef(onScanSuccess);
  onScanSuccessRef.current = onScanSuccess;

  useEffect(() => {
    if (!isOpen) return;

    setErrorMsg(null);
    setIsCameraActive(false);
    let isMounted = true;
    let scanTimer: ReturnType<typeof setTimeout> | null = null;
    let hasSucceeded = false;

    const stopMediaTracks = () => {
      if (scanTimer) {
        clearTimeout(scanTimer);
        scanTimer = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch (_) {}
        });
        streamRef.current = null;
      }
      if (videoRef.current) {
        try {
          videoRef.current.pause();
          videoRef.current.srcObject = null;
        } catch (_) {}
      }
    };

    const startCameraAndScan = async () => {
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        if (isMounted) {
          setErrorMsg("Votre navigateur ne permet pas l'accès à la caméra.");
        }
        return;
      }

      let stream: MediaStream | null = null;
      const constraintsList: MediaStreamConstraints[] = [
        {
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        {
          audio: false,
          video: { facingMode: 'environment' },
        },
        {
          audio: false,
          video: true,
        },
      ];

      let lastErr: any = null;
      for (const constraints of constraintsList) {
        if (!isMounted) return;
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (stream) break;
        } catch (err: any) {
          lastErr = err;
          // If the user explicitly denied permission, do not keep re-prompting
          if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
            break;
          }
        }
      }

      if (!isMounted) {
        if (stream) {
          stream.getTracks().forEach((t) => {
            try { t.stop(); } catch (_) {}
          });
        }
        return;
      }

      if (!stream) {
        console.error('Camera access error:', lastErr);
        setErrorMsg("Impossible d'accéder à la caméra. Veuillez autoriser l'accès dans votre navigateur et réessayer.");
        return;
      }

      streamRef.current = stream;

      const videoEl = videoRef.current;
      if (videoEl) {
        videoEl.srcObject = stream;
        videoEl.setAttribute('playsinline', 'true');
        videoEl.muted = true;
        try {
          await videoEl.play();
        } catch (_) {}
      }

      if (!isMounted) {
        stopMediaTracks();
        return;
      }

      setIsCameraActive(true);

      // Prepare native BarcodeDetector if available + ZXing fallback via Html5Qrcode
      let nativeDetector: any = null;
      try {
        const BarcodeDetectorCtor = (window as any).BarcodeDetector;
        if (BarcodeDetectorCtor) {
          nativeDetector = new BarcodeDetectorCtor({
            formats: [
              'code_128',
              'code_39',
              'code_93',
              'ean_13',
              'ean_8',
              'upc_a',
              'upc_e',
              'itf',
              'qr_code',
            ],
          });
        }
      } catch (_) {}

      let zxingDecoder: any = null;
      const hiddenId = 'defibeo-zxing-hidden-decoder';
      try {
        let hiddenEl = document.getElementById(hiddenId);
        if (!hiddenEl) {
          hiddenEl = document.createElement('div');
          hiddenEl.id = hiddenId;
          hiddenEl.style.display = 'none';
          document.body.appendChild(hiddenEl);
        }
        const instance = new Html5Qrcode(hiddenId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODE_93,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
          verbose: false,
        } as any);
        zxingDecoder = (instance as any).qrcode;
      } catch (_) {}

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      const scanFrame = async () => {
        if (!isMounted || hasSucceeded) return;
        const v = videoRef.current;
        if (v && v.readyState >= 2 && v.videoWidth > 0 && v.videoHeight > 0) {
          // 1. Try native BarcodeDetector first
          if (nativeDetector) {
            try {
              const barcodes = await nativeDetector.detect(v);
              if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                const text = String(barcodes[0].rawValue).trim();
                if (text && isMounted && !hasSucceeded) {
                  hasSucceeded = true;
                  stopMediaTracks();
                  onScanSuccessRef.current(text);
                  return;
                }
              }
            } catch (_) {}
          }

          // 2. Fallback to ZXing canvas decoder
          if (ctx && zxingDecoder && typeof zxingDecoder.decodeAsync === 'function') {
            try {
              canvas.width = v.videoWidth;
              canvas.height = v.videoHeight;
              ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
              const res = await zxingDecoder.decodeAsync(canvas);
              if (res && res.text) {
                const text = String(res.text).trim();
                if (text && isMounted && !hasSucceeded) {
                  hasSucceeded = true;
                  stopMediaTracks();
                  onScanSuccessRef.current(text);
                  return;
                }
              }
            } catch (_) {}
          }
        }

        if (isMounted && !hasSucceeded) {
          scanTimer = setTimeout(scanFrame, 100);
        }
      };

      scanTimer = setTimeout(scanFrame, 120);
    };

    startCameraAndScan();

    return () => {
      isMounted = false;
      stopMediaTracks();
    };
  }, [isOpen]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs"
      id="barcode-scanner-modal-backdrop"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md h-fit bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col"
        id="barcode-scanner-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Camera Viewport */}
        <div
          className="relative bg-black flex flex-col items-center justify-center h-56 overflow-hidden"
          style={{ backgroundColor: '#0f172a' }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover bg-black"
          />

          {errorMsg && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-50 z-10">
              <span className="text-[15px] text-slate-800 font-sans font-medium mb-1">
                {errorMsg}
              </span>
              <span className="text-[13px] text-slate-500 font-sans">
                Veuillez vérifier vos autorisations d'accès à la caméra dans le navigateur.
              </span>
            </div>
          )}

          {!isCameraActive && !errorMsg && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center text-center text-white bg-black z-10"
              style={{ backgroundColor: '#0f172a' }}
            >
              <span
                className="text-[14px] text-white font-sans font-normal"
                style={{ fontSize: '14px', color: '#fff' }}
              >
                Recherche de caméra en cours...
              </span>
            </div>
          )}
        </div>

        {/* Footer with Close Button */}
        <div className="p-4 bg-white border-t border-slate-100 w-full text-center">
          <button
            type="button"
            onClick={onClose}
            style={{
              backgroundColor: 'rgb(210, 45, 11)',
              color: '#ffffff',
              borderRadius: '13px',
              fontSize: '18px',
              padding: '12px 14px',
              fontWeight: 'bold',
              display: 'block',
              width: '100%',
              textAlign: 'center',
              cursor: 'pointer',
              border: 'none',
              boxShadow: 'none',
            }}
            className="font-sans hover:opacity-90 cursor-pointer transition-all mb-3"
          >
            Fermer
          </button>
          <p
            className="font-sans leading-relaxed m-0"
            style={{ fontSize: '18px', color: '#000000' }}
          >
            Compatible uniquement avec les codes-barres émis par Defibeo.
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
};
