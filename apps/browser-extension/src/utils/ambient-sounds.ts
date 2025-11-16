import type { AmbientSoundType } from '@cuewise/shared';

/**
 * Ambient sound generator using Web Audio API
 * Generates continuous ambient sounds for focus sessions
 */
export class AmbientSoundPlayer {
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private oscillators: OscillatorNode[] = [];
  private noiseNode: AudioBufferSourceNode | null = null;
  private isPlaying = false;
  private currentSound: AmbientSoundType = 'none';

  private initAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
    }
  }

  /**
   * Generate white noise buffer
   */
  private createNoiseBuffer(type: 'white' | 'brown' = 'white'): AudioBuffer {
    if (!this.audioContext) throw new Error('Audio context not initialized');

    const bufferSize = this.audioContext.sampleRate * 2; // 2 seconds
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);

    if (type === 'white') {
      // White noise - equal power across frequencies
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    } else {
      // Brown noise - lower frequencies emphasized
      let lastOut = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = data[i];
        data[i] *= 3.5; // Amplify
      }
    }

    return buffer;
  }

  /**
   * Create rain sound using filtered noise
   */
  private createRainSound() {
    if (!this.audioContext || !this.gainNode) return;

    // Use white noise filtered to sound like rain
    const noiseBuffer = this.createNoiseBuffer('white');
    const noise = this.audioContext.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;

    // Band-pass filter for rain effect
    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1000;
    filter.Q.value = 0.5;

    noise.connect(filter);
    filter.connect(this.gainNode);
    noise.start();

    this.noiseNode = noise;
  }

  /**
   * Create ocean waves sound
   */
  private createOceanSound() {
    if (!this.audioContext || !this.gainNode) return;

    // Low frequency oscillation for wave movement
    const lfo = this.audioContext.createOscillator();
    lfo.frequency.value = 0.2; // Very slow for wave rhythm
    lfo.type = 'sine';

    const lfoGain = this.audioContext.createGain();
    lfoGain.gain.value = 200;

    // Filtered noise for wave sound
    const noiseBuffer = this.createNoiseBuffer('white');
    const noise = this.audioContext.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;

    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    filter.Q.value = 1;

    // Connect LFO to modulate filter frequency
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    noise.connect(filter);
    filter.connect(this.gainNode);

    lfo.start();
    noise.start();

    this.noiseNode = noise;
    this.oscillators.push(lfo);
  }

  /**
   * Create forest sound (birds and wind)
   */
  private createForestSound() {
    if (!this.audioContext || !this.gainNode) return;

    // Wind sound - filtered white noise
    const noiseBuffer = this.createNoiseBuffer('white');
    const wind = this.audioContext.createBufferSource();
    wind.buffer = noiseBuffer;
    wind.loop = true;

    const windFilter = this.audioContext.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 400;

    const windGain = this.audioContext.createGain();
    windGain.gain.value = 0.3;

    wind.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(this.gainNode);
    wind.start();

    this.noiseNode = wind;

    // Occasional bird chirps using oscillators with random timing
    // (simplified version - real implementation would be more complex)
    const birdFreqs = [800, 1200, 1600, 2000];
    for (const freq of birdFreqs) {
      setTimeout(() => {
        if (this.isPlaying && this.audioContext && this.gainNode) {
          const osc = this.audioContext.createOscillator();
          osc.frequency.value = freq;
          osc.type = 'sine';

          const birdGain = this.audioContext.createGain();
          birdGain.gain.setValueAtTime(0, this.audioContext.currentTime);
          birdGain.gain.linearRampToValueAtTime(0.1, this.audioContext.currentTime + 0.05);
          birdGain.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.2);

          osc.connect(birdGain);
          birdGain.connect(this.gainNode);
          osc.start();
          osc.stop(this.audioContext.currentTime + 0.2);
        }
      }, Math.random() * 5000);
    }
  }

  /**
   * Create cafe ambience
   */
  private createCafeSound() {
    if (!this.audioContext || !this.gainNode) return;

    // Background chatter - brown noise
    const noiseBuffer = this.createNoiseBuffer('brown');
    const chatter = this.audioContext.createBufferSource();
    chatter.buffer = noiseBuffer;
    chatter.loop = true;

    const chatterFilter = this.audioContext.createBiquadFilter();
    chatterFilter.type = 'bandpass';
    chatterFilter.frequency.value = 600;
    chatterFilter.Q.value = 0.8;

    chatter.connect(chatterFilter);
    chatterFilter.connect(this.gainNode);
    chatter.start();

    this.noiseNode = chatter;
  }

  /**
   * Create white noise
   */
  private createWhiteNoise() {
    if (!this.audioContext || !this.gainNode) return;

    const noiseBuffer = this.createNoiseBuffer('white');
    const noise = this.audioContext.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;

    noise.connect(this.gainNode);
    noise.start();

    this.noiseNode = noise;
  }

  /**
   * Create brown noise
   */
  private createBrownNoise() {
    if (!this.audioContext || !this.gainNode) return;

    const noiseBuffer = this.createNoiseBuffer('brown');
    const noise = this.audioContext.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;

    noise.connect(this.gainNode);
    noise.start();

    this.noiseNode = noise;
  }

  /**
   * Play ambient sound
   */
  play(soundType: AmbientSoundType, volume: number = 50) {
    if (soundType === 'none' || this.isPlaying) return;

    this.initAudioContext();
    this.currentSound = soundType;
    this.isPlaying = true;

    // Set volume (0-100 to 0-1)
    if (this.gainNode) {
      this.gainNode.gain.value = volume / 200; // Reduced for ambient background
    }

    // Create appropriate sound
    switch (soundType) {
      case 'rain':
        this.createRainSound();
        break;
      case 'ocean':
        this.createOceanSound();
        break;
      case 'forest':
        this.createForestSound();
        break;
      case 'cafe':
        this.createCafeSound();
        break;
      case 'whiteNoise':
        this.createWhiteNoise();
        break;
      case 'brownNoise':
        this.createBrownNoise();
        break;
    }
  }

  /**
   * Stop playing ambient sound
   */
  stop() {
    if (!this.isPlaying) return;

    // Fade out
    if (this.gainNode && this.audioContext) {
      this.gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.5);
    }

    // Stop after fade
    setTimeout(() => {
      // Stop all oscillators
      this.oscillators.forEach((osc) => {
        try {
          osc.stop();
        } catch (_e) {
          // Already stopped
        }
      });
      this.oscillators = [];

      // Stop noise
      if (this.noiseNode) {
        try {
          this.noiseNode.stop();
        } catch (_e) {
          // Already stopped
        }
        this.noiseNode = null;
      }

      this.isPlaying = false;
      this.currentSound = 'none';
    }, 500);
  }

  /**
   * Update volume
   */
  setVolume(volume: number) {
    if (this.gainNode && this.isPlaying) {
      this.gainNode.gain.value = volume / 200;
    }
  }

  /**
   * Check if currently playing
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Get current sound type
   */
  getCurrentSound(): AmbientSoundType {
    return this.currentSound;
  }
}

// Singleton instance
export const ambientSoundPlayer = new AmbientSoundPlayer();
