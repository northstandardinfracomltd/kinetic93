import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface DetectableModelVariable {
  id: string;
  nom: string;
  marque: string;
  category: string;
  imageUrl?: string;
  [key: string]: any;
}

interface AiModelDetectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableModels: DetectableModelVariable[];
  onDetected: (model: { id: string; nom: string; marque: string }) => void;
}

interface ModelVisualDescriptor {
  model: DetectableModelVariable;
  colorHist: Float32Array;   // 36 bins (Hue/Sat/Val + RGB ratios)
  spatialGrid: Float32Array; // 8x8 x 3 normalized RGB
  edgeGrid: Float32Array;    // 8x8 luminance gradients
}

const GRID_SIZE = 8;
const SAMPLE_SIZE = 48;

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (max !== min) {
    switch (max) {
      case rf:
        h = (gf - bf) / d + (gf < bf ? 6 : 0);
        break;
      case gf:
        h = (bf - rf) / d + 2;
        break;
      case bf:
        h = (rf - gf) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h, s, v];
}

function extractDescriptorFromImageData(
  imgData: ImageData,
  trimBackground: boolean
): { colorHist: Float32Array; spatialGrid: Float32Array; edgeGrid: Float32Array; contrast: number; meanLum: number } | null {
  const { data, width, height } = imgData;
  if (width === 0 || height === 0) return null;

  let minX = 0;
  let minY = 0;
  let maxX = width - 1;
  let maxY = height - 1;

  if (trimBackground) {
    let foundMinX = width;
    let foundMinY = height;
    let foundMaxX = 0;
    let foundMaxY = 0;
    let fgCount = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];
        // Ignore transparent or near-pure-white background pixels
        const isTransparent = a < 40;
        const isPureWhite = r > 244 && g > 244 && b > 244;
        if (!isTransparent && !isPureWhite) {
          if (x < foundMinX) foundMinX = x;
          if (x > foundMaxX) foundMaxX = x;
          if (y < foundMinY) foundMinY = y;
          if (y > foundMaxY) foundMaxY = y;
          fgCount++;
        }
      }
    }

    if (fgCount > width * height * 0.05 && foundMaxX > foundMinX && foundMaxY > foundMinY) {
      minX = foundMinX;
      minY = foundMinY;
      maxX = foundMaxX;
      maxY = foundMaxY;
    }
  }

  const cropW = Math.max(1, maxX - minX + 1);
  const cropH = Math.max(1, maxY - minY + 1);

  // 36-bin histogram:
  // 0..17: 18 Hue bins weighted by saturation (chromatic signature of the defibrillator casing)
  // 18..25: 8 Saturation bins
  // 26..35: 10 Value/Luminance bins
  const colorHist = new Float32Array(36);
  const spatialGrid = new Float32Array(GRID_SIZE * GRID_SIZE * 3);
  const lumGrid = new Float32Array(GRID_SIZE * GRID_SIZE);
  const cellCounts = new Float32Array(GRID_SIZE * GRID_SIZE);

  let lumSum = 0;
  let lumSqSum = 0;
  let validPixelCount = 0;

  for (let y = minY; y <= maxY; y++) {
    const gy = Math.min(GRID_SIZE - 1, Math.floor(((y - minY) / cropH) * GRID_SIZE));
    for (let x = minX; x <= maxX; x++) {
      const gx = Math.min(GRID_SIZE - 1, Math.floor(((x - minX) / cropW) * GRID_SIZE));
      const idx = (y * width + x) * 4;
      const a = data[idx + 3];
      if (a < 30) continue;

      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      if (trimBackground && r > 246 && g > 246 && b > 246) {
        continue;
      }

      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      lumSum += lum;
      lumSqSum += lum * lum;
      validPixelCount++;

      const [h, s, v] = rgbToHsv(r, g, b);
      if (s > 0.15 && v > 0.12) {
        const hBin = Math.min(17, Math.floor(h * 18));
        colorHist[hBin] += s; // Weight chromatic hue by saturation
      }
      const sBin = 18 + Math.min(7, Math.floor(s * 8));
      colorHist[sBin] += 1;

      const vBin = 26 + Math.min(9, Math.floor(v * 10));
      colorHist[vBin] += 1;

      const cellIdx = gy * GRID_SIZE + gx;
      spatialGrid[cellIdx * 3] += r / 255;
      spatialGrid[cellIdx * 3 + 1] += g / 255;
      spatialGrid[cellIdx * 3 + 2] += b / 255;
      lumGrid[cellIdx] += lum / 255;
      cellCounts[cellIdx] += 1;
    }
  }

  if (validPixelCount < 20) return null;

  const meanLum = lumSum / validPixelCount;
  const variance = Math.max(0, lumSqSum / validPixelCount - meanLum * meanLum);
  const contrast = Math.sqrt(variance);

  // Normalize histogram (L2 norm for Hue, L2 norm for Sat/Val)
  let hueNorm = 0;
  for (let i = 0; i < 18; i++) hueNorm += colorHist[i] * colorHist[i];
  hueNorm = Math.sqrt(hueNorm) || 1;
  for (let i = 0; i < 18; i++) colorHist[i] /= hueNorm;

  let svNorm = 0;
  for (let i = 18; i < 36; i++) svNorm += colorHist[i] * colorHist[i];
  svNorm = Math.sqrt(svNorm) || 1;
  for (let i = 18; i < 36; i++) colorHist[i] /= svNorm;

  // Normalize spatial cells
  for (let c = 0; c < GRID_SIZE * GRID_SIZE; c++) {
    const cnt = cellCounts[c] || 1;
    spatialGrid[c * 3] /= cnt;
    spatialGrid[c * 3 + 1] /= cnt;
    spatialGrid[c * 3 + 2] /= cnt;
    lumGrid[c] /= cnt;
  }

  // Compute 8x8 edge gradient descriptor
  const edgeGrid = new Float32Array(GRID_SIZE * GRID_SIZE);
  let edgeNorm = 0;
  for (let gy = 0; gy < GRID_SIZE; gy++) {
    for (let gx = 0; gx < GRID_SIZE; gx++) {
      const c = gy * GRID_SIZE + gx;
      const right = gy * GRID_SIZE + Math.min(GRID_SIZE - 1, gx + 1);
      const down = Math.min(GRID_SIZE - 1, gy + 1) * GRID_SIZE + gx;
      const dx = lumGrid[right] - lumGrid[c];
      const dy = lumGrid[down] - lumGrid[c];
      const mag = Math.sqrt(dx * dx + dy * dy);
      edgeGrid[c] = mag;
      edgeNorm += mag * mag;
    }
  }
  edgeNorm = Math.sqrt(edgeNorm) || 1;
  for (let i = 0; i < edgeGrid.length; i++) {
    edgeGrid[i] /= edgeNorm;
  }

  return { colorHist, spatialGrid, edgeGrid, contrast, meanLum };
}

function compareDescriptors(
  a: { colorHist: Float32Array; spatialGrid: Float32Array; edgeGrid: Float32Array },
  b: { colorHist: Float32Array; spatialGrid: Float32Array; edgeGrid: Float32Array }
): number {
  // 1. Chromatic Hue cosine similarity (0..17)
  let hueDot = 0;
  for (let i = 0; i < 18; i++) {
    hueDot += a.colorHist[i] * b.colorHist[i];
  }

  // 2. Sat/Val cosine similarity (18..35)
  let svDot = 0;
  for (let i = 18; i < 36; i++) {
    svDot += a.colorHist[i] * b.colorHist[i];
  }

  // 3. Spatial color similarity (1 - mean absolute difference)
  let spatialDiff = 0;
  for (let i = 0; i < a.spatialGrid.length; i++) {
    spatialDiff += Math.abs(a.spatialGrid[i] - b.spatialGrid[i]);
  }
  const spatialSim = Math.max(0, 1 - spatialDiff / a.spatialGrid.length);

  // 4. Edge gradient cosine similarity
  let edgeDot = 0;
  for (let i = 0; i < a.edgeGrid.length; i++) {
    edgeDot += a.edgeGrid[i] * b.edgeGrid[i];
  }

  return 0.42 * hueDot + 0.18 * svDot + 0.25 * spatialSim + 0.15 * edgeDot;
}

function getModelThumbnailUrl(m: DetectableModelVariable): string {
  const raw =
    m.imageUrl ||
    m['Image URL'] ||
    m['Image URL.'] ||
    m.selectionMiniature ||
    m.miniature ||
    '';
  return String(raw).trim();
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

async function loadModelDescriptor(model: DetectableModelVariable): Promise<ModelVisualDescriptor | null> {
  const rawUrl = getModelThumbnailUrl(model);
  if (!rawUrl) return null;

  const urlsToTry: string[] = [];
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
    urlsToTry.push(`/api/proxy-image?url=${encodeURIComponent(rawUrl)}`);
    urlsToTry.push(rawUrl);
  } else {
    urlsToTry.push(rawUrl);
  }

  for (const url of urlsToTry) {
    try {
      const img = await loadImageElement(url);
      const canvas = document.createElement('canvas');
      canvas.width = SAMPLE_SIZE;
      canvas.height = SAMPLE_SIZE;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) continue;
      ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      const imgData = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      const desc = extractDescriptorFromImageData(imgData, true);
      if (desc) {
        return {
          model,
          colorHist: desc.colorHist,
          spatialGrid: desc.spatialGrid,
          edgeGrid: desc.edgeGrid,
        };
      }
    } catch (_) {
      // Try next URL
    }
  }
  return null;
}

export const AiModelDetectionModal: React.FC<AiModelDetectionModalProps> = ({
  isOpen,
  onClose,
  availableModels,
  onDetected,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraErrorMsg, setCameraErrorMsg] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<'scanning' | 'success' | 'error'>('scanning');
  const [detectedModel, setDetectedModel] = useState<DetectableModelVariable | null>(null);
  const [scanCycle, setScanCycle] = useState<number>(0);

  const descriptorsRef = useRef<ModelVisualDescriptor[]>([]);
  const descriptorsLoadedRef = useRef<boolean>(false);

  // Preload and compute visual descriptors for all Modèle Défibrillateur thumbnails from the tenant's spreadsheet
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    descriptorsLoadedRef.current = false;

    const preloadThumbnails = async () => {
      const modelsWithThumbnails = (availableModels || []).filter(
        (m) => (!m.category || m.category === 'Modèle Défibrillateur') && getModelThumbnailUrl(m).length > 0
      );

      const loaded = await Promise.all(modelsWithThumbnails.map((m) => loadModelDescriptor(m)));
      if (!isMounted) return;
      descriptorsRef.current = loaded.filter((d): d is ModelVisualDescriptor => d !== null);
      descriptorsLoadedRef.current = true;
    };

    preloadThumbnails();

    return () => {
      isMounted = false;
    };
  }, [isOpen, availableModels]);

  // Camera startup and cleanup
  useEffect(() => {
    if (!isOpen) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch (_) {}
        });
        streamRef.current = null;
      }
      setIsCameraActive(false);
      setCameraErrorMsg(null);
      setScanStatus('scanning');
      setDetectedModel(null);
      return;
    }

    let isMounted = true;
    setCameraErrorMsg(null);
    setIsCameraActive(false);
    setScanStatus('scanning');
    setDetectedModel(null);

    const startCamera = async () => {
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        if (isMounted) {
          setCameraErrorMsg("Impossible d'accéder à la caméra sur cet appareil.");
          setScanStatus('error');
        }
        return;
      }

      const constraintsToTry: MediaStreamConstraints[] = [
        {
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        { audio: false, video: { facingMode: 'environment' } },
        { audio: false, video: true },
      ];

      for (const constraints of constraintsToTry) {
        if (!isMounted) return;
        try {
          const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
          if (!isMounted) {
            mediaStream.getTracks().forEach((t) => {
              try {
                t.stop();
              } catch (_) {}
            });
            return;
          }
          streamRef.current = mediaStream;
          if (videoRef.current) {
            videoRef.current.srcObject = mediaStream;
            videoRef.current.setAttribute('playsinline', 'true');
            videoRef.current.muted = true;
            try {
              await videoRef.current.play();
            } catch (_) {}
          }
          setIsCameraActive(true);
          return;
        } catch (err: any) {
          if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
            break;
          }
        }
      }

      if (isMounted) {
        setCameraErrorMsg("Impossible d'accéder à la caméra. Veuillez autoriser l'accès à la caméra.");
        setScanStatus('error');
      }
    };

    const timer = setTimeout(startCamera, 80);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch (_) {}
        });
        streamRef.current = null;
      }
    };
  }, [isOpen]);

  // Ensure video element stays attached to stream when restarting scan
  useEffect(() => {
    if (isOpen && isCameraActive && videoRef.current && streamRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
      videoRef.current.play().catch(() => {});
    }
  }, [isOpen, isCameraActive, scanStatus, scanCycle]);

  // Continuous live embedded visual comparison loop (without taking a photo)
  useEffect(() => {
    if (!isOpen || !isCameraActive || scanStatus !== 'scanning') return;

    let isMounted = true;
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const voteScores = new Map<string, { count: number; totalSim: number; maxSim: number; model: DetectableModelVariable }>();
    let validFramesProcessed = 0;
    const startTime = Date.now();
    const MAX_SCAN_DURATION_MS = 7500;
    const MIN_FRAMES_BEFORE_DECISION = 5;
    const SIMILARITY_THRESHOLD = 0.54;

    const intervalId = setInterval(() => {
      if (!isMounted) return;

      const elapsed = Date.now() - startTime;
      const descriptors = descriptorsRef.current;

      // If thumbnails finished loading and there are 0 model thumbnails available in the tenant's spreadsheet
      if (descriptorsLoadedRef.current && descriptors.length === 0 && elapsed > 2200) {
        setScanStatus('error');
        return;
      }

      if (elapsed > MAX_SCAN_DURATION_MS) {
        // Check if we accumulated a reasonable match before timing out
        let bestCandidate: { count: number; totalSim: number; maxSim: number; model: DetectableModelVariable } | null = null;
        for (const entry of voteScores.values()) {
          if (!bestCandidate || entry.totalSim > bestCandidate.totalSim) {
            bestCandidate = entry;
          }
        }
        if (bestCandidate && bestCandidate.count >= 3 && bestCandidate.maxSim >= SIMILARITY_THRESHOLD) {
          setDetectedModel(bestCandidate.model);
          setScanStatus('success');
        } else {
          setScanStatus('error');
        }
        return;
      }

      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0 || !ctx) {
        return;
      }

      if (!descriptorsLoadedRef.current || descriptors.length === 0) {
        return;
      }

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const baseSide = Math.min(vw, vh);

      // Multi-scale center crop (80% and 60% of center viewport) to handle "ni trop près, ni trop loin"
      const cropScales = [0.8, 0.6];
      let bestFrameModel: DetectableModelVariable | null = null;
      let bestFrameSim = -1;
      let frameValid = false;

      for (const scale of cropScales) {
        const side = Math.floor(baseSide * scale);
        const sx = Math.floor((vw - side) / 2);
        const sy = Math.floor((vh - side) / 2);

        ctx.clearRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        ctx.drawImage(video, sx, sy, side, side, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        const frameData = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        const frameDesc = extractDescriptorFromImageData(frameData, false);

        // Ignore pitch-black, overexposed, or zero-contrast frames (e.g. covered camera)
        if (!frameDesc || frameDesc.contrast < 11 || frameDesc.meanLum < 16 || frameDesc.meanLum > 246) {
          continue;
        }

        frameValid = true;

        for (const modelDesc of descriptors) {
          const sim = compareDescriptors(frameDesc, modelDesc);
          if (sim > bestFrameSim) {
            bestFrameSim = sim;
            bestFrameModel = modelDesc.model;
          }
        }
      }

      if (!frameValid || !bestFrameModel) return;

      validFramesProcessed++;

      if (bestFrameSim >= SIMILARITY_THRESHOLD) {
        const prev = voteScores.get(bestFrameModel.id) || {
          count: 0,
          totalSim: 0,
          maxSim: 0,
          model: bestFrameModel,
        };
        prev.count += 1;
        prev.totalSim += bestFrameSim;
        prev.maxSim = Math.max(prev.maxSim, bestFrameSim);
        voteScores.set(bestFrameModel.id, prev);

        // Once we have enough consistent frames confirming the same model, trigger success
        if (validFramesProcessed >= MIN_FRAMES_BEFORE_DECISION && prev.count >= 4) {
          setDetectedModel(bestFrameModel);
          setScanStatus('success');
        }
      }
    }, 350);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [isOpen, isCameraActive, scanStatus, scanCycle]);

  const handleConfirmSelection = () => {
    if (detectedModel) {
      onDetected({
        id: detectedModel.id,
        nom: detectedModel.nom,
        marque: detectedModel.marque || 'Standard',
      });
    }
    onClose();
  };

  const handleRestartScan = () => {
    setDetectedModel(null);
    setScanStatus('scanning');
    setScanCycle((c) => c + 1);
  };

  if (!isOpen || typeof document === 'undefined') return null;

  const formattedModelName = detectedModel
    ? `${detectedModel.nom}${
        detectedModel.marque &&
        detectedModel.marque !== 'Standard' &&
        !detectedModel.nom.toLowerCase().includes(detectedModel.marque.toLowerCase())
          ? ` (${detectedModel.marque})`
          : ''
      }`
    : '';

  return createPortal(
    <div
      className="fixed inset-0 z-[100050] flex items-center justify-center bg-slate-900/80 backdrop-blur-xs p-0 md:p-4 animate-fadeIn"
      id="ai-model-detector-modal-backdrop"
    >
      <div
        className="relative w-full h-full md:h-auto md:max-h-[92vh] md:max-w-xl bg-white md:rounded-2xl shadow-2xl overflow-hidden flex flex-col font-sans"
        id="ai-model-detector-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar: Full-width Annuler button in rgb(210, 45, 11) matching FORM RAPPORT UI */}
        <div className="w-full shrink-0 m-0 p-0">
          <button
            type="button"
            onClick={onClose}
            id="btn-cancel-model-guess"
            style={{
              width: '100%',
              borderRadius: '0px',
              padding: '14px 8px',
              backgroundColor: 'rgb(210, 45, 11)',
              color: '#ffffff',
              fontSize: '18px',
              fontWeight: 100,
              border: 'none',
              margin: 0,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
            }}
            className="transition-opacity hover:opacity-95 cursor-pointer font-sans select-none"
          >
            Annuler
          </button>
        </div>

        {/* Large live camera feed viewport (without taking a photo) */}
        <div
          className="relative flex-1 min-h-[320px] sm:min-h-[380px] w-full flex flex-col items-center justify-center overflow-hidden"
          style={{ backgroundColor: '#0f172a' }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />

          {/* Subtle center framing guide while scanning */}
          {isCameraActive && scanStatus === 'scanning' && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-8">
              <div
                className="w-64 h-64 sm:w-72 sm:h-72 rounded-2xl border-2 border-white/60 transition-all"
                style={{
                  boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.28)',
                }}
              />
            </div>
          )}

          {!isCameraActive && !cameraErrorMsg && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center text-center text-white p-6 z-10"
              style={{ backgroundColor: '#0f172a' }}
            >
              <span className="text-[15px] text-white font-sans font-normal">
                Ouverture de la caméra en cours...
              </span>
            </div>
          )}
        </div>

        {/* Bottom status & actions panel inspired by FORM RAPPORT UI */}
        <div className="p-5 bg-white border-t border-slate-100 w-full text-center space-y-4 shrink-0">
          {scanStatus === 'scanning' && (
            <p
              className="font-sans leading-relaxed m-0"
              style={{
                fontSize: '18px',
                color: '#000000',
                fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
              }}
            >
              Analyse en cours. Placez-vous bien face au matériel, ni trop près, ni trop loin.
            </p>
          )}

          {scanStatus === 'error' && (
            <div className="space-y-3">
              <p
                className="font-sans leading-relaxed m-0"
                style={{
                  fontSize: '18px',
                  color: '#000000',
                  fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                }}
              >
                Aucune correspondance trouvée. Réessayez ou sélectionnez le modèle manuellement.
              </p>
              <button
                type="button"
                onClick={handleRestartScan}
                style={{
                  backgroundColor: '#0f172a',
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
                }}
                className="font-sans hover:opacity-90 cursor-pointer transition-all"
              >
                Réessayer
              </button>
            </div>
          )}

          {scanStatus === 'success' && detectedModel && (
            <div className="space-y-3">
              <p
                className="font-sans leading-relaxed m-0"
                style={{
                  fontSize: '18px',
                  color: '#000000',
                  fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                }}
              >
                Il semble qu’il s’agisse de ce modèle: <strong className="font-bold">{formattedModelName}</strong>.
              </p>
              <div className="space-y-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleConfirmSelection}
                  style={{
                    backgroundColor: '#2e54ff',
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
                  }}
                  className="font-sans hover:opacity-95 cursor-pointer transition-all"
                >
                  Oui, sélectionner
                </button>
                <button
                  type="button"
                  onClick={handleRestartScan}
                  style={{
                    backgroundColor: '#0f172a',
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
                  }}
                  className="font-sans hover:opacity-90 cursor-pointer transition-all"
                >
                  Non, recommencer
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
