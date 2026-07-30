import React, { useState, useEffect, useRef } from 'react';
import { Camera, RefreshCw, Check, Loader2, AlertCircle, Sparkles } from 'lucide-react';

interface Variable {
  id: string;
  nom: string;
  marque: string;
  category: string;
}

interface AiModelDetectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableModels: Variable[];
  onDetected: (model: { id: string; nom: string; marque: string }) => void;
}

export const AiModelDetectionModal: React.FC<AiModelDetectionModalProps> = ({
  isOpen,
  onClose,
  availableModels,
  onDetected,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>("");
  const [detectedModel, setDetectedModel] = useState<{ id: string; nom: string; marque: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Robust Camera Startup and Cleanup
  useEffect(() => {
    if (!isOpen) {
      if (stream) {
        stream.getTracks().forEach(track => {
          try {
            track.stop();
          } catch (e) {}
        });
        setStream(null);
      }
      setIsCameraActive(false);
      setDetectedModel(null);
      setErrorMessage(null);
      setLoading(false);
      return;
    }

    let isMounted = true;
    let localStream: MediaStream | null = null;

    const startCamera = async () => {
      setErrorMsg(null);
      setIsCameraActive(false);

      // Sequence of camera constraints to try (prefer rear/environment camera)
      const constraintsToTry = [
        { video: { facingMode: { exact: 'environment' } } },
        { video: { facingMode: 'environment' } },
        { video: true }
      ];

      for (const constraints of constraintsToTry) {
        if (!isMounted) return;
        try {
          const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
          if (!isMounted) {
            mediaStream.getTracks().forEach(t => t.stop());
            return;
          }
          localStream = mediaStream;
          setStream(mediaStream);
          if (videoRef.current) {
            videoRef.current.srcObject = mediaStream;
          }
          setIsCameraActive(true);
          return; // Success
        } catch (err) {
          console.warn("Failed starting camera constraints attempt:", constraints, err);
        }
      }

      if (isMounted) {
        setErrorMsg("Impossible d'accéder à la caméra. Veuillez autoriser l'accès à la caméra dans vos paramètres.");
      }
    };

    // Small delay to ensure container exists in DOM
    const timer = setTimeout(() => {
      startCamera();
    }, 150);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (localStream) {
        localStream.getTracks().forEach(track => {
          try {
            track.stop();
          } catch (e) {}
        });
      }
    };
  }, [isOpen]);

  const handleIdentify = async () => {
    if (!videoRef.current) return;
    setLoading(true);
    setErrorMessage(null);
    setStatusText("Capture de l'image...");

    try {
      // 1. Capture current frame from video element
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error("Impossible de créer le contexte canvas pour capturer la photo.");
      }

      // Draw frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Convert to base64
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      const base64Prefix = 'data:image/jpeg;base64,';
      if (!dataUrl.startsWith(base64Prefix)) {
        throw new Error("Échec de la conversion de l'image en base64.");
      }
      const base64Data = dataUrl.substring(base64Prefix.length);

      setStatusText("Analyse visuelle avec Gemini...");

      // 2. Map available models to format sent to backend
      const modelsList = availableModels.map(m => ({
        id: m.id,
        nom: m.nom,
        marque: m.marque,
      }));

      // 3. Post to backend Gemini vision detection API
      const response = await fetch('/api/gemini/detect-model', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: base64Data,
          mimeType: 'image/jpeg',
          availableModels: modelsList,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Erreur serveur (Status ${response.status})`);
      }

      const result = await response.json();
      if (!result || !result.nom || !result.marque) {
        throw new Error("Le modèle d'IA n'a pas pu identifier le défibrillateur.");
      }

      setDetectedModel({
        id: result.id || '',
        nom: result.nom,
        marque: result.marque,
      });
    } catch (err: any) {
      console.error("AI Model Detection Error:", err);
      setErrorMessage(err.message || "Une erreur inconnue s'est produite.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (detectedModel) {
      onDetected(detectedModel);
    }
    onClose();
  };

  const handleRetry = () => {
    setDetectedModel(null);
    setErrorMessage(null);
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs" id="ai-model-detector-modal-backdrop">
      <div className="relative w-full max-w-md h-fit bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col" id="ai-model-detector-modal-content">
        
        {/* Camera Viewport / Visual Feedback Header */}
        <div className="relative bg-black flex flex-col items-center justify-center h-64 overflow-hidden" style={{ backgroundColor: '#000' }}>
          
          {/* Main video stream */}
          {!detectedModel && (
            <>
              {isCameraActive ? (
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white bg-black z-10 p-6" style={{ backgroundColor: '#000' }}>
                  {!errorMsg ? (
                    <span className="text-[14px] text-white font-sans font-normal">
                      Recherche de caméra en cours...
                    </span>
                  ) : (
                    <div className="space-y-2">
                      <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
                      <p className="text-[13px] text-slate-300 font-sans max-w-[280px]">
                        {errorMsg}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Loading Indicator Overlay */}
          {loading && (
            <div className="absolute inset-0 bg-slate-900/95 z-20 flex flex-col items-center justify-center text-center p-6 text-white animate-fadeIn">
              <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
              <p className="text-[15px] font-sans font-semibold text-white">
                Analyse en cours...
              </p>
            </div>
          )}

          {/* Success display */}
          {detectedModel && !loading && !errorMessage && (
            <div className="absolute inset-0 bg-slate-950 z-20 flex flex-col items-center justify-center text-center p-6 text-white leading-relaxed">
              <div className="w-12 h-12 bg-green-500/15 border border-green-500/30 rounded-full flex items-center justify-center text-green-400 mb-3 animate-bounce">
                <Check className="w-6 h-6" />
              </div>
              <p className="text-[14px] font-sans font-bold text-green-400">Modèle identifié par l'IA !</p>
              <div className="mt-3 p-3 bg-slate-900 border border-slate-800 rounded-xl w-full max-w-[300px]">
                <p className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">Résultat</p>
                <p className="text-[15px] font-bold text-white mt-1 leading-snug">{detectedModel.nom}</p>
                <p className="text-[12px] text-slate-400 mt-0.5">Fabricant : <strong className="text-slate-200">{detectedModel.marque}</strong></p>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions block (Matches style perfectly) */}
        <div className="p-4 bg-white border-t border-slate-100 w-full text-center space-y-3">
          
          {/* Default Preview State */}
          {!detectedModel && !errorMessage && !loading && (
            <>
              <button 
                type="button"
                onClick={handleIdentify}
                disabled={!isCameraActive}
                style={{
                  backgroundColor: isCameraActive ? '#2563eb' : '#94a3b8',
                  color: '#ffffff',
                  borderRadius: '13px',
                  fontSize: '18px',
                  padding: '12px 14px',
                  fontWeight: 'bold',
                  display: 'block',
                  width: '100%',
                  textAlign: 'center',
                  cursor: isCameraActive ? 'pointer' : 'not-allowed',
                  border: 'none'
                }}
                className="font-sans hover:bg-blue-700 cursor-pointer transition-all active:scale-[0.99]"
              >
                <span>Trouver avec l'IA</span>
              </button>
              
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
                className="font-sans hover:bg-neutral-900 cursor-pointer transition-all"
              >
                Annuler
              </button>
            </>
          )}

          {/* Loading state footer */}
          {loading && (
            <button 
              type="button"
              disabled
              style={{
                backgroundColor: '#cbd5e1',
                color: '#64748b',
                borderRadius: '13px',
                fontSize: '18px',
                padding: '12px 14px',
                fontWeight: 'bold',
                display: 'block',
                width: '100%',
                textAlign: 'center',
                cursor: 'not-allowed',
                border: 'none'
              }}
              className="font-sans"
            >
              Analyse en cours...
            </button>
          )}

          {/* Error State Footer */}
          {errorMessage && !loading && (
            <>
              <button 
                type="button"
                onClick={handleRetry}
                style={{
                  backgroundColor: '#2563eb',
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
                className="font-sans hover:bg-blue-700 cursor-pointer transition-all"
              >
                Réessayer la capture
              </button>

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
                className="font-sans hover:bg-neutral-900 cursor-pointer transition-all"
              >
                Fermer
              </button>
            </>
          )}

          {/* Success State Footer */}
          {detectedModel && !loading && !errorMessage && (
            <>
              <button 
                type="button"
                onClick={handleConfirm}
                style={{
                  backgroundColor: '#16a34a',
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
                className="font-sans hover:bg-green-700 cursor-pointer transition-all"
              >
                Confirmer ce modèle
              </button>

              <button 
                type="button"
                onClick={handleRetry}
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
                className="font-sans hover:bg-neutral-900 cursor-pointer transition-all"
              >
                Prendre une autre photo
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
