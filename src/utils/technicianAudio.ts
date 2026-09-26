// Sound effects utility for the Technician WebApp (PublicPortal)

export const SOUND_ASSETS = {
  SOUND1: "https://civilprom.s3.eu-north-1.amazonaws.com/soundfxwebapp1.mp3",
  SOUND2: "https://civilprom.s3.eu-north-1.amazonaws.com/soundfxwebapp2.mp3",
  SOUND3: "https://civilprom.s3.eu-north-1.amazonaws.com/soundfxwebapp3.mp3",
} as const;

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
  try {
    const audio = new Audio(SOUND_ASSETS.SOUND2);
    audio.play().catch(() => {
      // Ignore user gesture rejection
    });
  } catch {
    // Ignore error
  }
};

/**
 * Sound3: Completion/End feedback (Submit report edit/correction, End work clock-in)
 */
export const playTechSound3 = () => {
  try {
    const audio = new Audio(SOUND_ASSETS.SOUND3);
    audio.play().catch(() => {
      // Ignore user gesture rejection
    });
  } catch {
    // Ignore error
  }
};
