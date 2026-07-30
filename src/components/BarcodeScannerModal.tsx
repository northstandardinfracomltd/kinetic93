import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (decodedText: string) => void;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({ isOpen, onClose, onScanSuccess }) => {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const qrCodeInstanceRef = useRef<Html5Qrcode | null>(null);
  const elementId = "html5-qrcode-scanner-element";

  useEffect(() => {
    if (!isOpen) return;

    setErrorMsg(null);
    setIsCameraActive(false);
    let html5QrcodeInstance: Html5Qrcode | null = null;
    let isMounted = true;

    // Timeout to make sure target container div exists in the DOM
    const timer = setTimeout(() => {
      const config = {
        fps: 25,
        // CRITICAL: We DO NOT pass a qrbox here. Doing so enables FULL-FRAME scanning under the hood.
        // By scanning the entire uncropped high-resolution stream, we bypass iOS canvas cropping misalignment bugs
        // and let the ZXing engine scan wide horizontal barcodes with 100% of the camera's resolution.
        // Our visual CSS frame on top is purely visual, guiding the user where to align the barcode.
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
        experimentalFeatures: {
          // Enabled native barcode detector! iOS 17+ supports this natively. It uses the Apple Neural Engine
          // to spot linear barcodes instantly and flawlessly on the camera stream with zero lag.
          useBarCodeDetectorIfSupported: true,
        }
      };

      const startScanner = async () => {
        if (!isMounted) return;
        setErrorMsg(null);

        // Define our fallback sequence of camera configurations.
        // By instantiating a FRESH Html5Qrcode on each attempt, we completely avoid
        // any internal state transition exceptions ("already under transition").
        const configsToTry: any[] = [
          { facingMode: 'environment' },
          { facingMode: 'user' }
        ];

        try {
          const devices = await Html5Qrcode.getCameras();
          if (isMounted && devices && devices.length > 0) {
            const backCam = devices.find(device => {
              const label = device.label.toLowerCase();
              return label.includes('back') || 
                     label.includes('arrière') ||
                     label.includes('rear') ||
                     label.includes('environment') ||
                     label.includes('externe') ||
                     label.includes('cam 1') ||
                     label.includes('cam 2');
            });
            const selectedDevice = backCam || devices[0];
            // Insert camera hardware-specific targeting modes at the front of the list
            configsToTry.unshift(
              { deviceId: selectedDevice.id },
              { deviceId: { exact: selectedDevice.id } }
            );
          }
        } catch (camErr) {
          console.warn("getCameras() failed or was blocked by permissions. Using standard facing modes.", camErr);
        }

        let started = false;
        let lastError: any = null;

        for (const cameraSpec of configsToTry) {
          if (!isMounted) return;

          // Clear any stale previous instance state
          if (html5QrcodeInstance) {
            try {
              if (html5QrcodeInstance.isScanning) {
                await html5QrcodeInstance.stop();
              }
            } catch (err) {
              console.warn("Silent error cleaning up previous instance scanning state:", err);
            }
            html5QrcodeInstance = null;
            qrCodeInstanceRef.current = null;
          }

          // Instantiate a fresh, clean instance
          try {
            const container = document.getElementById(elementId);
            if (!container && isMounted) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }

            html5QrcodeInstance = new Html5Qrcode(elementId);
            qrCodeInstanceRef.current = html5QrcodeInstance;

            await html5QrcodeInstance.start(
              cameraSpec,
              config,
              (decodedText) => {
                if (isMounted) {
                  onScanSuccess(decodedText);
                  stopAndUnmount();
                }
              },
              () => {
                // Silent catch for negative scan frames
              }
            );

            started = true;
            if (isMounted) setIsCameraActive(true);
            break;
          } catch (err: any) {
            lastError = err;
            console.warn("Failed startup attempt with spec:", cameraSpec, err);
            // Wait 150ms to allow browser hardware locks to release
            await new Promise(resolve => setTimeout(resolve, 150));
          }
        }

        if (!started && isMounted) {
          console.error("All camera start strategies exhausted. Last error:", lastError);
          setErrorMsg("Impossible d'accéder à la caméra. Veuillez autoriser l'accès et réessayer.");
        }
      };

      startScanner();
    }, 200);

    const stopAndUnmount = () => {
      // 1. Ask the library instance to stop scanning recursively or clear
      if (html5QrcodeInstance) {
        if (html5QrcodeInstance.isScanning) {
          html5QrcodeInstance.stop().catch(err => {
            console.error("Failed standard stop:", err);
          }).finally(() => {
            if (isMounted) setIsCameraActive(false);
          });
        } else {
          try {
            html5QrcodeInstance.clear();
          } catch (err) {
            // Ignore
          }
        }
      }

      // 2. Foolproof fallback: Grab the video tag in the container and stop active hardware media tracks directly.
      // This immediately extinguishes the green camera active hardware LED/indicator in the client browser.
      try {
        const container = document.getElementById(elementId);
        const videos = container?.getElementsByTagName("video");
        if (videos) {
          for (let i = 0; i < videos.length; i++) {
            const video = videos[i];
            const stream = video.srcObject as MediaStream;
            if (stream) {
              stream.getTracks().forEach(track => {
                try {
                  track.stop();
                } catch (e) {}
              });
            }
          }
        }
      } catch (trackErr) {
        console.warn("Error releasing camera tracks directly:", trackErr);
      }
    };

    return () => {
      isMounted = false;
      clearTimeout(timer);
      stopAndUnmount();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const fermerButtonStyle: React.CSSProperties = {
    backgroundColor: '#334155',
    color: '#fff',
    borderRadius: '10px',
    fontSize: '14px',
    padding: '7px 16px',
    fontWeight: '600',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    border: 'none',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs" id="barcode-scanner-modal-backdrop">
      <div className="relative w-full max-w-md h-fit bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col" id="barcode-scanner-modal-content">
        
        {/* Camera Viewport */}
        <div className="relative bg-black flex flex-col items-center justify-center h-48" style={{ backgroundColor: '#000' }}>
          <style>{`
            #${elementId} {
              background-color: #000 !important;
              background: #000 !important;
            }
            #${elementId} video {
              object-fit: cover !important;
              width: 100% !important;
              height: 100% !important;
              background-color: #000 !important;
              background: #000 !important;
            }
            #${elementId} canvas {
              display: none !important;
            }
          `}</style>
          <div id={elementId} className="w-full h-full max-w-full overflow-hidden" />
          
          {errorMsg && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-50 z-10">
              <span className="text-[14px] text-slate-700 font-sans font-medium mb-1">
                {errorMsg}
              </span>
              <span className="text-[11.5px] text-slate-400 font-sans">
                Veuillez réessayer ou vérifier vos autorisations d'accès à la caméra.
              </span>
            </div>
          )}

          {!isCameraActive && !errorMsg && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white bg-black z-10" style={{ backgroundColor: '#000' }}>
              <span className="text-[14px] text-white font-sans font-normal" style={{ fontSize: '14px', color: '#fff' }}>
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
              backgroundColor: '#000000',
              color: '#ffffff',
              borderRadius: '13px',
              fontSize: '18px',
              padding: '12px 14px',
              fontWeight: 'bold',
              display: 'block',
              width: '100%',
              textAlign: 'center',
              cursor: 'pointer',
              border: 'none'
            }}
            className="font-sans hover:bg-neutral-900 cursor-pointer transition-all mb-3"
          >
            Fermer
          </button>
          <p className="text-[12px] text-slate-500 font-sans leading-relaxed">
            Compatible uniquement avec les codes-barres émis par Défibeo et ceux du système GS1.
          </p>
        </div>
      </div>
    </div>
  );
};
