/**
 * Sound utilities for Pomodoro timer notifications
 * Uses Web Audio API to generate notification sounds without external audio files
 */

import { logger, type NotificationSoundType } from '@cuewise/shared';

// Create audio context (reused across all sounds)
let audioContext: AudioContext | null = null;

const getAudioContext = (): AudioContext => {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
};

interface NoteConfig {
  freq: number;
  start: number;
  duration: number;
}

/**
 * Play a sequence of notes with specified oscillator type and envelope
 */
const playNotes = (
  notes: NoteConfig[],
  oscillatorType: OscillatorType,
  envelope: 'smooth' | 'bell' | 'sharp'
): void => {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  notes.forEach((note) => {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    const startTime = now + note.start;
    const endTime = startTime + note.duration;

    oscillator.frequency.setValueAtTime(note.freq, startTime);
    oscillator.type = oscillatorType;

    // Apply envelope based on type
    gainNode.gain.setValueAtTime(0, startTime);

    if (envelope === 'smooth') {
      // Gentle fade-in and fade-out
      gainNode.gain.linearRampToValueAtTime(0.25, startTime + 0.2);
      gainNode.gain.linearRampToValueAtTime(0.25, endTime - 0.15);
      gainNode.gain.linearRampToValueAtTime(0, endTime);
    } else if (envelope === 'bell') {
      // Bell-like: quick attack, natural decay
      gainNode.gain.linearRampToValueAtTime(0.28, startTime + 0.15);
      gainNode.gain.exponentialRampToValueAtTime(0.01, endTime);
    } else if (envelope === 'sharp') {
      // Sharp attack for digital sounds
      gainNode.gain.linearRampToValueAtTime(0.2, startTime + 0.05);
      gainNode.gain.linearRampToValueAtTime(0.2, endTime - 0.1);
      gainNode.gain.linearRampToValueAtTime(0, endTime);
    }

    oscillator.start(startTime);
    oscillator.stop(endTime);
  });
};

// Sound configurations for different types
const START_SOUNDS: Record<Exclude<NotificationSoundType, 'none'>, () => void> = {
  // Chime: Uplifting ascending melody (C5 -> E5 -> G5)
  chime: () => {
    playNotes(
      [
        { freq: 523.25, start: 0, duration: 0.4 }, // C5
        { freq: 659.25, start: 0.35, duration: 0.4 }, // E5
        { freq: 783.99, start: 0.7, duration: 0.7 }, // G5
      ],
      'sine',
      'smooth'
    );
  },

  // Bell: Single rich bell tone with harmonics
  bell: () => {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Create multiple oscillators for rich bell sound
    const frequencies = [880, 1760, 2640]; // A5 and harmonics
    const gains = [0.3, 0.15, 0.08];

    frequencies.forEach((freq, i) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.frequency.setValueAtTime(freq, now);
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(gains[i], now + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

      oscillator.start(now);
      oscillator.stop(now + 1.5);
    });
  },

  // Digital: Short electronic beeps
  digital: () => {
    playNotes(
      [
        { freq: 880, start: 0, duration: 0.15 }, // A5
        { freq: 1108.73, start: 0.2, duration: 0.15 }, // C#6
        { freq: 1318.51, start: 0.4, duration: 0.25 }, // E6
      ],
      'square',
      'sharp'
    );
  },

  // Gentle: Soft, low tones
  gentle: () => {
    playNotes(
      [
        { freq: 392, start: 0, duration: 0.6 }, // G4
        { freq: 493.88, start: 0.5, duration: 0.8 }, // B4
      ],
      'sine',
      'smooth'
    );
  },
};

const COMPLETION_SOUNDS: Record<Exclude<NotificationSoundType, 'none'>, () => void> = {
  // Chime: Celebratory 5-note melody
  chime: () => {
    playNotes(
      [
        { freq: 523.25, start: 0, duration: 0.5 }, // C5
        { freq: 659.25, start: 0.4, duration: 0.5 }, // E5
        { freq: 783.99, start: 0.8, duration: 0.5 }, // G5
        { freq: 1046.5, start: 1.2, duration: 0.6 }, // C6
        { freq: 783.99, start: 1.7, duration: 1.2 }, // G5
      ],
      'sine',
      'bell'
    );
  },

  // Bell: Rich celebratory bell
  bell: () => {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Two bell strikes
    [0, 0.6].forEach((offset) => {
      const frequencies = [698.46, 1396.91, 2093.0]; // F5 and harmonics
      const gains = [0.35, 0.18, 0.1];

      frequencies.forEach((freq, i) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.frequency.setValueAtTime(freq, now + offset);
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0, now + offset);
        gainNode.gain.linearRampToValueAtTime(gains[i], now + offset + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + offset + 1.8);

        oscillator.start(now + offset);
        oscillator.stop(now + offset + 1.8);
      });
    });
  },

  // Digital: Electronic success fanfare
  digital: () => {
    playNotes(
      [
        { freq: 659.25, start: 0, duration: 0.12 }, // E5
        { freq: 783.99, start: 0.15, duration: 0.12 }, // G5
        { freq: 987.77, start: 0.3, duration: 0.12 }, // B5
        { freq: 1318.51, start: 0.45, duration: 0.3 }, // E6
      ],
      'square',
      'sharp'
    );
  },

  // Gentle: Soft resolution
  gentle: () => {
    playNotes(
      [
        { freq: 392, start: 0, duration: 0.5 }, // G4
        { freq: 440, start: 0.4, duration: 0.5 }, // A4
        { freq: 493.88, start: 0.8, duration: 0.5 }, // B4
        { freq: 523.25, start: 1.2, duration: 1.0 }, // C5
      ],
      'sine',
      'smooth'
    );
  },
};

/**
 * Play a start sound with the specified type
 * @param soundType - The type of sound to play (default: 'gentle')
 */
export const playStartSound = (soundType: NotificationSoundType = 'gentle'): void => {
  if (soundType === 'none') {
    return;
  }

  try {
    const playSound = START_SOUNDS[soundType];
    if (playSound) {
      playSound();
    }
  } catch (error) {
    logger.error('Error playing start sound', error);
  }
};

/**
 * Play a completion sound with the specified type
 * @param soundType - The type of sound to play (default: 'gentle')
 */
export const playCompletionSound = (soundType: NotificationSoundType = 'gentle'): void => {
  if (soundType === 'none') {
    return;
  }

  try {
    const playSound = COMPLETION_SOUNDS[soundType];
    if (playSound) {
      playSound();
    }
  } catch (error) {
    logger.error('Error playing completion sound', error);
  }
};

/**
 * Preview a sound by type and context (start or completion)
 */
export const previewSound = (
  soundType: NotificationSoundType,
  context: 'start' | 'completion'
): void => {
  if (context === 'start') {
    playStartSound(soundType);
  } else {
    playCompletionSound(soundType);
  }
};
