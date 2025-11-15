/**
 * Sound utilities for Pomodoro timer notifications
 * Uses Web Audio API to generate notification sounds without external audio files
 */

// Create audio context (reused across all sounds)
let audioContext: AudioContext | null = null;

const getAudioContext = (): AudioContext => {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
};

/**
 * Play a "start" sound - a quick ascending tone
 * Indicates the beginning of a Pomodoro session
 */
export const playStartSound = (): void => {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Create oscillator for tone
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Quick ascending tone: 600Hz -> 800Hz
    oscillator.frequency.setValueAtTime(600, now);
    oscillator.frequency.linearRampToValueAtTime(800, now + 0.1);

    // Envelope: quick fade in and out
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.3, now + 0.05);
    gainNode.gain.linearRampToValueAtTime(0, now + 0.15);

    oscillator.type = 'sine';
    oscillator.start(now);
    oscillator.stop(now + 0.15);
  } catch (error) {
    console.error('Error playing start sound:', error);
  }
};

/**
 * Play a "completion" sound - a pleasant chime
 * Indicates the end of a Pomodoro session (work or break)
 */
export const playCompletionSound = (): void => {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Create three-note chime (like a bell)
    const frequencies = [523.25, 659.25, 783.99]; // C5, E5, G5 (C major chord)
    const delays = [0, 0.15, 0.3];

    frequencies.forEach((freq, index) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      const startTime = now + delays[index];

      oscillator.frequency.setValueAtTime(freq, startTime);
      oscillator.type = 'sine';

      // Bell-like envelope: quick attack, slow decay
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.8);

      oscillator.start(startTime);
      oscillator.stop(startTime + 0.8);
    });
  } catch (error) {
    console.error('Error playing completion sound:', error);
  }
};
