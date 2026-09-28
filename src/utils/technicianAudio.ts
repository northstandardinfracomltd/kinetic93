// Sound effects utility for the Technician WebApp (PublicPortal)
// Ultra-low-latency sound engine using pre-decoded Web Audio API AudioBuffers
// with HTML5 Audio element fallback pool for instant (<5ms) sound playback.

export const SOUND_ASSETS = {
  SOUND1: "https://civilprom.s3.eu-north-1.amazonaws.com/soundfxwebapp1.mp3",
  SOUND2: "https://civilprom.s3.eu-north-1.amazonaws.com/soundfxwebapp2.mp3",
  SOUND3: "https://civilprom.s3.eu-north-1.amazonaws.com/soundfxwebapp3.mp3",
} as const;

type SoundKey = keyof typeof SOUND_ASSETS;

// Shared AudioContext
let audioCtx: AudioContext | null = null;
const audioBuffers: Partial<Record<SoundKey, AudioBuffer>> = {};
const rawArrayBuffers: Partial<Record<SoundKey, ArrayBuffer>> = {};
const fallbackAudios: Partial<Record<SoundKey, HTMLAudioElement[]>> = {};

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

// Unlock AudioContext on first user interaction
const unlockAudioContext = () => {
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
};

// Pre-fetch raw array buffers immediately and decode them
const preloadSounds = async () => {
  if (typeof window === "undefined") return;

  // Listen to unlock on any user gesture as early as possible
  window.addEventListener("pointerdown", unlockAudioContext, { capture: true, once: false });
  window.addEventListener("click", unlockAudioContext, { capture: true, once: false });
  window.addEventListener("touchstart", unlockAudioContext, { capture: true, once: false, passive: true });
  window.addEventListener("keydown", unlockAudioContext, { capture: true, once: false });

  const keys: SoundKey[] = ["SOUND1", "SOUND2", "SOUND3"];

  // 1. Prepare HTML5 Audio fallback pool with preload="auto"
  keys.forEach((key) => {
    try {
      const a1 = new Audio(SOUND_ASSETS[key]);
      a1.preload = "auto";
      const a2 = new Audio(SOUND_ASSETS[key]);
      a2.preload = "auto";
      fallbackAudios[key] = [a1, a2];
    } catch {}
  });

  // 2. Fetch and decode with Web Audio API for true 0-delay playback
  await Promise.all(
    keys.map(async (key) => {
      try {
        const res = await fetch(SOUND_ASSETS[key], { mode: "cors" });
        if (!res.ok) return;
        const arrayBuf = await res.arrayBuffer();
        rawArrayBuffers[key] = arrayBuf;
        decodeBuffer(key, arrayBuf);
      } catch {
        // Fallback to HTML5 audio already initialized
      }
    })
  );
};

const decodeBuffer = async (key: SoundKey, arrayBuf: ArrayBuffer) => {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    // arrayBuffer is transferred in slice so it can be re-decoded if needed
    const bufferCopy = arrayBuf.slice(0);
    const audioBuffer = await ctx.decodeAudioData(bufferCopy);
    audioBuffers[key] = audioBuffer;
  } catch {
    // Decoding error, fallback will be used
  }
};

// Play a preloaded sound instantly
export const playSound = (key: SoundKey) => {
  try {
    const ctx = getAudioContext();
    if (ctx) {
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }

      const buffer = audioBuffers[key];
      if (buffer) {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
        return;
      } else if (rawArrayBuffers[key]) {
        // Buffer was downloaded but not yet decoded
        decodeBuffer(key, rawArrayBuffers[key]!).then(() => {
          if (audioBuffers[key]) {
            playSound(key);
          }
        });
      }
    }

    // Fallback: use preloaded HTML5 Audio elements
    const pool = fallbackAudios[key];
    if (pool && pool.length > 0) {
      let available = pool.find((a) => a.paused || a.ended);
      if (!available) {
        available = pool[0];
      }
      if (available) {
        available.currentTime = 0;
        available.play().catch(() => {});
        return;
      }
    }

    const fallback = new Audio(SOUND_ASSETS[key]);
    fallback.play().catch(() => {});
  } catch {
    // Silent catch
  }
};

// Start preloading immediately as the module is evaluated
if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", preloadSounds, { once: true });
  } else {
    preloadSounds();
  }
}

/**
 * Triggers Sound1 upon technician webapp open (login or reload).
 * Handles browser autoplay policy restrictions gracefully by attaching
 * a one-time gesture listener if autoplay is initially blocked.
 */
export const triggerPublicPortalOpenSound = (): (() => void) => {
  let hasPlayed = false;

  const tryPlay = () => {
    if (hasPlayed) return;
    try {
      const ctx = getAudioContext();
      if (ctx && audioBuffers.SOUND1 && ctx.state === "running") {
        playSound("SOUND1");
        hasPlayed = true;
        cleanup();
        return;
      }

      // Try HTML5 audio if Web Audio API not yet un-suspended
      const audio = new Audio(SOUND_ASSETS.SOUND1);
      const promise = audio.play();
      if (promise !== undefined) {
        promise
          .then(() => {
            hasPlayed = true;
            cleanup();
          })
          .catch(() => {
            // Autoplay blocked by browser until user gesture
          });
      } else {
        hasPlayed = true;
        cleanup();
      }
    } catch {
      // Audio playback error ignored
    }
  };

  const handleUserInteraction = () => {
    if (!hasPlayed) {
      unlockAudioContext();
      tryPlay();
    }
  };

  const cleanup = () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("pointerdown", handleUserInteraction, true);
      window.removeEventListener("click", handleUserInteraction, true);
      window.removeEventListener("touchstart", handleUserInteraction, true);
      window.removeEventListener("keydown", handleUserInteraction, true);
    }
  };

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
 * Sound2: Action feedback (Tour select, Mission Rapport/Y aller, Spontaneous events, Frais, Relevé concurrentiel, Start work period)
 */
export const playTechSound2 = () => {
  playSound("SOUND2");
};

/**
 * Sound3: Completion/End feedback (Submit report edit/correction, End work clock-in)
 */
export const playTechSound3 = () => {
  playSound("SOUND3");
};
