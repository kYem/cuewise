/**
 * Sound utilities for Pomodoro timer notifications
 * Uses Web Audio API to generate notification sounds without external audio files
 */

import { logger } from '@cuewise/shared';

// Create audio context (reused across all sounds)
let audioContext: AudioContext | null = null;

const getAudioContext = (): AudioContext => {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
};

/**
 * Play a "start" sound - an uplifting ascending melody (~1.5s)
 * Indicates the beginning of a Pomodoro session
 * Follows UX best practices: gentle fade-in to avoid startle response
 */
export const playStartSound = (): void => {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Uplifting ascending melody: C5 -> E5 -> G5 (major triad)
    const notes = [
      { freq: 523.25, start: 0, duration: 0.4 }, // C5
      { freq: 659.25, start: 0.35, duration: 0.4 }, // E5
      { freq: 783.99, start: 0.7, duration: 0.7 }, // G5 (longer final note)
    ];

    notes.forEach((note) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      const startTime = now + note.start;
      const endTime = startTime + note.duration;

      oscillator.frequency.setValueAtTime(note.freq, startTime);
      oscillator.type = 'sine';

      // Gentle envelope: smooth fade-in (0.2s) and fade-out
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.25, startTime + 0.2); // Gentle 0.2s fade-in
      gainNode.gain.linearRampToValueAtTime(0.25, endTime - 0.15); // Hold
      gainNode.gain.linearRampToValueAtTime(0, endTime); // Smooth fade-out

      oscillator.start(startTime);
      oscillator.stop(endTime);
    });
  } catch (error) {
    logger.error('Error playing start sound', error);
  }
};

/**
 * Play a "completion" sound - a celebratory chime melody (~2.5s)
 * Indicates the end of a Pomodoro session (work or break)
 * A pleasant 5-note ascending then resolving melody to mark achievement
 */
export const playCompletionSound = (): void => {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Celebratory 5-note melody: C5 -> E5 -> G5 -> C6 -> G5
    // Ascending to celebrate, then resolving back down
    const melody = [
      { freq: 523.25, start: 0, duration: 0.5 }, // C5
      { freq: 659.25, start: 0.4, duration: 0.5 }, // E5
      { freq: 783.99, start: 0.8, duration: 0.5 }, // G5
      { freq: 1046.5, start: 1.2, duration: 0.6 }, // C6 (octave up - climax)
      { freq: 783.99, start: 1.7, duration: 1.2 }, // G5 (longer resolution)
    ];

    melody.forEach((note) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      const startTime = now + note.start;
      const endTime = startTime + note.duration;

      oscillator.frequency.setValueAtTime(note.freq, startTime);
      oscillator.type = 'sine';

      // Bell-like envelope: gentle attack, natural decay
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.28, startTime + 0.15); // Gentle 0.15s attack
      gainNode.gain.exponentialRampToValueAtTime(0.01, endTime); // Natural exponential decay

      oscillator.start(startTime);
      oscillator.stop(endTime);
    });
  } catch (error) {
    logger.error('Error playing completion sound', error);
  }
};
