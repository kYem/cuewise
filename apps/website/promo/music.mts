import { writeFileSync } from 'node:fs';

const SAMPLE_RATE = 44100;

type Chord = { bass: number; notes: number[] };

const PROGRESSION: Chord[] = [
  { bass: 41, notes: [57, 60, 64, 67] },
  { bass: 45, notes: [55, 60, 64, 71] },
  { bass: 38, notes: [53, 57, 60, 64] },
  { bass: 46, notes: [57, 62, 65, 69] },
  { bass: 41, notes: [57, 60, 64, 67] },
  { bass: 45, notes: [55, 60, 64, 71] },
  { bass: 46, notes: [57, 62, 65, 69] },
  { bass: 41, notes: [53, 57, 60, 64, 72] },
];

const CHIME_SCALE = [77, 81, 84, 86, 79, 88, 84, 81, 86, 89, 84, 77];

const midiToHz = (m: number): number => 440 * 2 ** ((m - 69) / 12);

function smoothstep(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
}

function padVoice(out: Float32Array, hz: number, start: number, end: number, gain: number) {
  const attack = 2.2;
  const release = 2.8;
  const i0 = Math.max(0, Math.floor((start - 0.2) * SAMPLE_RATE));
  const i1 = Math.min(out.length, Math.ceil((end + release) * SAMPLE_RATE));
  const detune = [0.9965, 1, 1.0035];
  const phase = [0.1, 0.7, 0.4];
  for (let i = i0; i < i1; i++) {
    const t = i / SAMPLE_RATE;
    const env = smoothstep((t - start) / attack) * (1 - smoothstep((t - end) / release));
    if (env <= 0) {
      continue;
    }
    const breathe = 0.85 + 0.15 * Math.sin(2 * Math.PI * 0.13 * t + hz);
    let s = 0;
    for (let v = 0; v < detune.length; v++) {
      const w = 2 * Math.PI * hz * detune[v] * t + phase[v];
      s += Math.sin(w) + 0.18 * Math.sin(2 * w) + 0.05 * Math.sin(3 * w);
    }
    out[i] += (s / detune.length) * env * breathe * gain;
  }
}

function chime(out: Float32Array, hz: number, at: number, gain: number) {
  const i0 = Math.floor(at * SAMPLE_RATE);
  const i1 = Math.min(out.length, i0 + Math.floor(4 * SAMPLE_RATE));
  for (let i = i0; i < i1; i++) {
    const t = (i - i0) / SAMPLE_RATE;
    const env = Math.min(1, t / 0.01) * Math.exp(-t * 1.6);
    const w = 2 * Math.PI * hz * t;
    out[i] += (Math.sin(w) + 0.3 * Math.sin(2.01 * w) + 0.08 * Math.sin(3.98 * w)) * env * gain;
  }
}

function reverb(dry: Float32Array, wet: number): Float32Array {
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map((d) => ({
    buf: new Float32Array(d),
    idx: 0,
    store: 0,
  }));
  const allpasses = [556, 441, 341].map((d) => ({ buf: new Float32Array(d), idx: 0 }));
  const feedback = 0.86;
  const damp = 0.3;
  const out = new Float32Array(dry.length);
  for (let i = 0; i < dry.length; i++) {
    const input = dry[i] * 0.2;
    let acc = 0;
    for (const c of combs) {
      const y = c.buf[c.idx];
      c.store = y * (1 - damp) + c.store * damp;
      c.buf[c.idx] = input + c.store * feedback;
      c.idx = (c.idx + 1) % c.buf.length;
      acc += y;
    }
    for (const a of allpasses) {
      const b = a.buf[a.idx];
      a.buf[a.idx] = acc + b * 0.5;
      a.idx = (a.idx + 1) % a.buf.length;
      acc = b - acc;
    }
    out[i] = dry[i] * (1 - wet) + acc * wet;
  }
  return out;
}

function toWav(left: Float32Array, right: Float32Array): Buffer {
  const frames = left.length;
  const buf = Buffer.alloc(44 + frames * 4);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + frames * 4, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(frames * 4, 40);
  for (let i = 0; i < frames; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[i])) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[i])) * 32767), 46 + i * 4);
  }
  return buf;
}

/** Renders a calm ambient pad, with a soft chime on each scene cut, to a 16-bit stereo WAV. */
export function renderMusic(path: string, duration: number, cues: number[]): void {
  const length = Math.ceil(duration * SAMPLE_RATE);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  const chordSpan = duration / PROGRESSION.length;

  PROGRESSION.forEach((chord, i) => {
    const start = i * chordSpan;
    const end = i === PROGRESSION.length - 1 ? duration : start + chordSpan;
    padVoice(left, midiToHz(chord.bass), start, end, 0.07);
    padVoice(right, midiToHz(chord.bass), start, end, 0.07);
    chord.notes.forEach((note, n) => {
      const pan = n % 2 === 0 ? 0.62 : 0.38;
      padVoice(left, midiToHz(note), start, end, 0.05 * (1 - pan) * 2);
      padVoice(right, midiToHz(note), start, end, 0.05 * pan * 2);
    });
  });

  cues.forEach((at, i) => {
    const hz = midiToHz(CHIME_SCALE[i % CHIME_SCALE.length]);
    const pan = i % 2 === 0 ? 0.35 : 0.65;
    chime(left, hz, at, 0.05 * (1 - pan) * 2);
    chime(right, hz, at, 0.05 * pan * 2);
  });

  const l = reverb(left, 0.35);
  const r = reverb(right, 0.35);

  let peak = 0;
  for (let i = 0; i < length; i++) {
    peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]));
  }
  const norm = peak > 0 ? 0.6 / peak : 1;
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const master = smoothstep(t / 1.5) * (1 - smoothstep((t - (duration - 3)) / 3));
    l[i] *= norm * master;
    r[i] *= norm * master;
  }

  writeFileSync(path, toWav(l, r));
}
