// Short synthesized cues for lesson answers: no audio files to download or cache.
// One switch covers both sound and vibration; it is remembered per browser.

export type LessonCue = "correct" | "wrong" | "complete";

const STORAGE_KEY = "qm_lesson_sound";

type Note = [frequency: number, offset: number, duration: number];

const CUES: Record<LessonCue, { notes: Note[]; wave: OscillatorType; peak: number; vibrate: number | number[] }> = {
  // E5 then B5: a short rising chime.
  correct: { notes: [[659.25, 0, 0.12], [987.77, 0.09, 0.24]], wave: "sine", peak: 0.2, vibrate: 25 },
  // A3 sliding down to F3: soft, not alarming.
  wrong: { notes: [[220, 0, 0.18], [174.61, 0.12, 0.28]], wave: "triangle", peak: 0.18, vibrate: [70, 50, 70] },
  // C major arpeggio for finishing a mini-lesson.
  complete: {
    notes: [[523.25, 0, 0.12], [659.25, 0.1, 0.12], [783.99, 0.2, 0.12], [1046.5, 0.3, 0.36]],
    wave: "sine",
    peak: 0.2,
    vibrate: [30, 40, 30, 40, 60],
  },
};

let context: AudioContext | null = null;

export function isLessonSoundEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setLessonSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Private mode or blocked storage: the switch still works for this page.
  }
}

/**
 * Call synchronously from the click that starts a check: iOS Safari only lets
 * audio start inside a user gesture, and the cue itself plays after the request.
 */
export function primeLessonSound(): void {
  if (typeof window === "undefined" || !isLessonSoundEnabled()) return;
  const AudioContextCtor =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;
  try {
    context ??= new AudioContextCtor();
    if (context.state === "suspended") void context.resume();
  } catch {
    context = null;
  }
}

export function playLessonCue(cue: LessonCue): void {
  if (typeof window === "undefined" || !isLessonSoundEnabled()) return;
  const { notes, wave, peak, vibrate } = CUES[cue];

  // Chrome refuses (and logs) vibration before the user has interacted with the page.
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  if (!activation || activation.hasBeenActive) {
    try {
      navigator.vibrate?.(vibrate);
    } catch {
      // Some browsers throw instead of ignoring vibration.
    }
  }

  primeLessonSound();
  if (!context) return;
  const start = context.currentTime + 0.01;
  for (const [frequency, offset, duration] of notes) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const at = start + offset;
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
  }
}
