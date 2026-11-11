// Sound effects utility for the Technician WebApp (PublicPortal)
// Preloads all audio files into in-memory Blob URLs and Web Audio API AudioBuffers
// for instant, zero-network-latency playback without double emissions.

export const LOCAL_SOUND_ASSETS = {
  SOUND1: "/sounds/soundfxwebapp3.mp3",
  SOUND2: "/sounds/soundfxwebapp2.mp3",
  SOUND3: "/sounds/soundfxwebapp3.mp3",
  NAV_CLICK: "/sounds/tapeffectuiappdefibeo.mp3",
  TAP_EFFECT: "/sounds/tapeffectuiappdefibeo.mp3",
  REFUSAL_EFFECT: "/sounds/refusaluiapdefibeo.mp3",
  SUCCESS_EFFECT: "/sounds/successuibuttondefibeo.mp3",
} as const;

export const REMOTE_SOUND_ASSETS = {
  SOUND1: "https://civilprom.s3.eu-north-1.amazonaws.com/soundfxwebapp3.mp3",
  SOUND2: "https://civilprom.s3.eu-north-1.amazonaws.com/soundfxwebapp2.mp3",
  SOUND3: "https://civilprom.s3.eu-north-1.amazonaws.com/soundfxwebapp3.mp3",
  NAV_CLICK: "https://civilprom.s3.eu-north-1.amazonaws.com/tapeffectuiappdefibeo.mp3",
  TAP_EFFECT: "https://civilprom.s3.eu-north-1.amazonaws.com/tapeffectuiappdefibeo.mp3",
  REFUSAL_EFFECT: "https://civilprom.s3.eu-north-1.amazonaws.com/refusaluiapdefibeo.mp3",
  SUCCESS_EFFECT: "https://civilprom.s3.eu-north-1.amazonaws.com/successuibuttondefibeo.mp3",
} as const;

export const SOUND_ASSETS = LOCAL_SOUND_ASSETS;

export type SoundKey = keyof typeof SOUND_ASSETS;

const ALL_SOUND_KEYS: SoundKey[] = [
  "TAP_EFFECT",
  "REFUSAL_EFFECT",
  "SUCCESS_EFFECT",
  "SOUND1",
  "SOUND2",
  "SOUND3",
  "NAV_CLICK",
];

// Shared AudioContext & in-memory caches
let audioCtx: AudioContext | null = null;
const audioBuffers: Partial<Record<SoundKey, AudioBuffer>> = {};
const rawArrayBuffers: Partial<Record<SoundKey, ArrayBuffer>> = {};
const blobUrls: Partial<Record<SoundKey, string>> = {};
const fallbackAudios: Partial<Record<SoundKey, HTMLAudioElement[]>> = {};
const activeBufferSources: Partial<Record<SoundKey, AudioBufferSourceNode>> = {};
let isPreloadStarted = false;

// Flag to mute audio effects when running from or inside main software side-pane
let audioMutedInMainSoftware = false;

export const setAudioMutedInMainSoftware = (muted: boolean) => {
  audioMutedInMainSoftware = muted;
};

export const isAudioMutedInMainSoftware = () => audioMutedInMainSoftware;

const getAudioContext = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      try {
        audioCtx = new AudioContextClass();
      } catch {
        // Web Audio unsupported
      }
    }
  }
  return audioCtx;
};

const decodeBuffer = async (key: SoundKey, arrayBuf: ArrayBuffer): Promise<AudioBuffer | null> => {
  if (audioBuffers[key]) return audioBuffers[key]!;
  const ctx = getAudioContext();
  if (!ctx) return null;
  try {
    const bufferCopy = arrayBuf.slice(0);
    const audioBuffer = await ctx.decodeAudioData(bufferCopy);
    audioBuffers[key] = audioBuffer;
    return audioBuffer;
  } catch {
    return null;
  }
};

// Unlock AudioContext and decode any pending buffers on user interaction
export const unlockAudioContext = () => {
  const ctx = getAudioContext();
  if (ctx) {
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    ALL_SOUND_KEYS.forEach((key) => {
      if (rawArrayBuffers[key] && !audioBuffers[key]) {
        decodeBuffer(key, rawArrayBuffers[key]!).catch(() => {});
      }
    });
  }
};

// Pre-fetch raw array buffers immediately, cache as in-memory Blob URLs, and prepare HTML5 Audio + Web Audio buffers
export const preloadSounds = async () => {
  if (typeof window === "undefined" || isPreloadStarted) return;
  isPreloadStarted = true;

  // Listen to unlock on any user gesture as early as possible
  const gestureEvents = ["pointerdown", "mousedown", "click", "touchstart", "keydown", "change"] as const;
  gestureEvents.forEach((evt) => {
    window.addEventListener(evt, unlockAudioContext, { capture: true, passive: true });
  });

  // 1. Prepare initial same-origin HTML5 Audio elements with preload="auto"
  ALL_SOUND_KEYS.forEach((key) => {
    try {
      const a1 = new Audio(LOCAL_SOUND_ASSETS[key]);
      a1.preload = "auto";
      a1.volume = 1.0;
      a1.muted = false;
      a1.load();
      fallbackAudios[key] = [a1];
    } catch {}
  });

  // 2. Fetch into memory cache (ArrayBuffer + Blob URL) for 0-network-delay playback
  await Promise.all(
    ALL_SOUND_KEYS.map(async (key) => {
      try {
        let res: Response | null = null;
        try {
          res = await fetch(LOCAL_SOUND_ASSETS[key]);
        } catch {
          res = null;
        }
        if (!res || !res.ok) {
          res = await fetch(REMOTE_SOUND_ASSETS[key], { mode: "cors" });
        }
        if (!res || !res.ok) return;

        const arrayBuf = await res.arrayBuffer();
        if (!arrayBuf || arrayBuf.byteLength === 0) return;
        rawArrayBuffers[key] = arrayBuf;

        // Create an in-memory Blob URL so HTML5 Audio never re-fetches over the network
        try {
          const blob = new Blob([arrayBuf.slice(0)], { type: "audio/mpeg" });
          const objectUrl = URL.createObjectURL(blob);
          blobUrls[key] = objectUrl;

          const a = new Audio(objectUrl);
          a.preload = "auto";
          a.volume = 1.0;
          a.muted = false;
          a.load();
          fallbackAudios[key] = [a];
        } catch {}

        // If AudioContext is already initialized, decode immediately
        if (audioCtx) {
          await decodeBuffer(key, arrayBuf);
        }
      } catch {
        // Fallback to HTML5 audio already initialized
      }
    })
  );
};

// Track last play timestamp per sound key and globally to prevent accidental double triggers
const lastPlayedAt: Partial<Record<SoundKey, number>> = {};
let lastGlobalPlayAt = 0;
let lastGlobalKey: SoundKey | null = null;

// Stop any currently playing instance of a given sound key so it never overlaps with itself
const stopActivePlaybackForKey = (key: SoundKey) => {
  const activeSource = activeBufferSources[key];
  if (activeSource) {
    try {
      activeSource.stop(0);
      activeSource.disconnect();
    } catch {}
    delete activeBufferSources[key];
  }
  const pool = fallbackAudios[key];
  if (pool) {
    pool.forEach((a) => {
      if (!a.paused) {
        try {
          a.pause();
          if (a.readyState >= 1) {
            a.currentTime = 0;
          }
        } catch {}
      }
    });
  }
};

// Helper to play via Web Audio API AudioBuffer (works even after async await once AudioContext is unlocked)
const playWithWebAudio = (key: SoundKey): boolean => {
  const ctx = getAudioContext();
  if (!ctx) return false;

  const startBufferSource = (buffer: AudioBuffer) => {
    try {
      stopActivePlaybackForKey(key);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      activeBufferSources[key] = source;
      source.onended = () => {
        if (activeBufferSources[key] === source) {
          delete activeBufferSources[key];
        }
      };
      source.start(0);
    } catch {}
  };

  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  const existingBuffer = audioBuffers[key];
  if (existingBuffer) {
    if (ctx.state === "running") {
      startBufferSource(existingBuffer);
      return true;
    }
    ctx
      .resume()
      .then(() => {
        startBufferSource(existingBuffer);
      })
      .catch(() => {});
    return true;
  }

  if (rawArrayBuffers[key]) {
    decodeBuffer(key, rawArrayBuffers[key]!)
      .then((decoded) => {
        if (!decoded) return;
        if (ctx.state === "running") {
          startBufferSource(decoded);
        } else {
          ctx
            .resume()
            .then(() => startBufferSource(decoded))
            .catch(() => {});
        }
      })
      .catch(() => {});
    return true;
  }

  return false;
};

// Play a preloaded sound instantly from cache without double emission
export const playSound = (key: SoundKey) => {
  if (audioMutedInMainSoftware) return;
  const now = Date.now();
  const minSameKeyInterval = 120;
  if (lastPlayedAt[key] && now - lastPlayedAt[key]! < minSameKeyInterval) {
    return;
  }
  if (lastGlobalKey === key && now - lastGlobalPlayAt < minSameKeyInterval) {
    return;
  }
  lastPlayedAt[key] = now;
  lastGlobalPlayAt = now;
  lastGlobalKey = key;

  try {
    // Ensure AudioContext is unlocked on this interaction
    unlockAudioContext();

    // Stop any in-flight playback of the same key to prevent double/overlapping emissions
    stopActivePlaybackForKey(key);

    // Primary: use preloaded in-memory HTML5 Audio element (backed by Blob URL or local asset)
    const pool = fallbackAudios[key];
    const primaryAudio = pool && pool.length > 0 ? pool[0] : null;

    if (primaryAudio) {
      primaryAudio.volume = 1.0;
      primaryAudio.muted = false;
      if (primaryAudio.readyState >= 1) {
        try {
          primaryAudio.currentTime = 0;
        } catch {}
      }
      const playPromise = primaryAudio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // If HTML5 Audio play was rejected (e.g. after async await in form submit), fallback to unlocked Web Audio API or fresh Audio clone
          if (!playWithWebAudio(key)) {
            try {
              const fresh = new Audio(blobUrls[key] || LOCAL_SOUND_ASSETS[key]);
              fresh.volume = 1.0;
              fresh.muted = false;
              fallbackAudios[key] = [fresh];
              fresh.play().catch(() => {});
            } catch {}
          }
        });
      }
      return;
    }

    // Secondary: if no HTML5 Audio element existed yet, try Web Audio API or create a new Audio element
    if (playWithWebAudio(key)) {
      return;
    }

    const cachedSrc = blobUrls[key] || LOCAL_SOUND_ASSETS[key];
    const fallback = new Audio(cachedSrc);
    fallback.volume = 1.0;
    fallback.muted = false;
    fallbackAudios[key] = [fallback];
    fallback.play().catch(() => {});
  } catch {
    // Silent catch
  }
};

// Start preloading immediately as the module is evaluated
if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        preloadSounds();
      },
      { once: true }
    );
  } else {
    preloadSounds();
  }
}

let activeOpenSoundCleanup: (() => void) | null = null;
let lastOpenSoundTimestamp = 0;

/**
 * Triggers Sound3 (same as report form submit) upon technician webapp preloader open (login or reload).
 * Handles browser autoplay policy restrictions gracefully by attaching
 * a one-time gesture listener if autoplay is initially blocked.
 */
export const triggerPublicPortalOpenSound = (): (() => void) => {
  if (activeOpenSoundCleanup) {
    activeOpenSoundCleanup();
    activeOpenSoundCleanup = null;
  }

  let hasPlayed = false;
  let isAttempting = false;

  const cleanup = () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("pointerdown", handleUserInteraction, true);
      window.removeEventListener("click", handleUserInteraction, true);
      window.removeEventListener("touchstart", handleUserInteraction, true);
      window.removeEventListener("keydown", handleUserInteraction, true);
    }
    if (activeOpenSoundCleanup === cleanup) {
      activeOpenSoundCleanup = null;
    }
  };

  const tryPlay = () => {
    if (hasPlayed || isAttempting) return;
    const now = Date.now();
    if (now - lastOpenSoundTimestamp < 1500) {
      hasPlayed = true;
      cleanup();
      return;
    }

    try {
      const ctx = getAudioContext();
      if (ctx && audioBuffers.SOUND3 && ctx.state === "running") {
        hasPlayed = true;
        lastOpenSoundTimestamp = Date.now();
        cleanup();
        playSound("SOUND3");
        return;
      }

      isAttempting = true;
      const pool = fallbackAudios.SOUND3;
      const audio = pool && pool.length > 0 && pool[0] ? pool[0] : new Audio(LOCAL_SOUND_ASSETS.SOUND3);
      if (audio.readyState >= 1) {
        try {
          audio.currentTime = 0;
        } catch {}
      }
      const promise = audio.play();
      if (promise !== undefined) {
        promise
          .then(() => {
            hasPlayed = true;
            isAttempting = false;
            lastOpenSoundTimestamp = Date.now();
            lastPlayedAt.SOUND3 = Date.now();
            cleanup();
          })
          .catch(() => {
            // Autoplay blocked by browser until user gesture
            isAttempting = false;
          });
      } else {
        hasPlayed = true;
        isAttempting = false;
        lastOpenSoundTimestamp = Date.now();
        lastPlayedAt.SOUND3 = Date.now();
        cleanup();
      }
    } catch {
      isAttempting = false;
    }
  };

  const handleUserInteraction = () => {
    if (!hasPlayed && !isAttempting) {
      unlockAudioContext();
      tryPlay();
    }
  };

  activeOpenSoundCleanup = cleanup;

  if (typeof window !== "undefined") {
    window.addEventListener("pointerdown", handleUserInteraction, true);
    window.addEventListener("click", handleUserInteraction, true);
    window.addEventListener("touchstart", handleUserInteraction, true);
    window.addEventListener("keydown", handleUserInteraction, true);
    tryPlay();
  }

  return cleanup;
};

/**
 * Sound2: Action feedback (Mission Rapport/Y aller, Spontaneous events, Frais, Relevé concurrentiel, Start work period)
 */
export const playTechSound2 = () => {
  playSound("SOUND2");
};

/**
 * Sound3: Completion/End feedback (End work clock-in)
 */
export const playTechSound3 = () => {
  playSound("SOUND3");
};

/**
 * TapEffect: https://civilprom.s3.eu-north-1.amazonaws.com/tapeffectuiappdefibeo.mp3
 */
export const playTechTapSound = () => {
  playSound("TAP_EFFECT");
};

/**
 * RefusalEffect: https://civilprom.s3.eu-north-1.amazonaws.com/refusaluiapdefibeo.mp3
 */
export const playTechRefusalSound = () => {
  playSound("REFUSAL_EFFECT");
};

/**
 * SuccessEffect: https://civilprom.s3.eu-north-1.amazonaws.com/successuibuttondefibeo.mp3
 */
export const playTechSuccessSound = () => {
  playSound("SUCCESS_EFFECT");
};

/**
 * NavClick: Legacy click sound effect alias -> TapEffect
 */
export const playTechNavClickSound = () => {
  playSound("TAP_EFFECT");
};
