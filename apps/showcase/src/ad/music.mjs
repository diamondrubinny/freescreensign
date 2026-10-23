// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

/**
 * Original background music for the video ad, synthesized from scratch (no samples, no
 * third-party recordings): a soft pad, a plucked arpeggio, bass, kick and hi-hat at 100 BPM,
 * over C – G – Am – F. Deterministic: the same file on every run.
 */
import { writeFileSync } from 'node:fs';

const RATE = 48_000;
const BPM = 100;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;

/** MIDI note → frequency. */
const hz = (note) => 440 * 2 ** ((note - 69) / 12);

// C, G, Am, F (two bars each), as MIDI notes: root for the bass, then the chord.
const CHORDS = [
  { root: 36, notes: [60, 64, 67, 72] },
  { root: 43, notes: [59, 62, 67, 71] },
  { root: 45, notes: [60, 64, 69, 72] },
  { root: 41, notes: [60, 65, 69, 72] },
];
const chordAt = (t) => CHORDS[Math.floor(t / (BAR * 2)) % CHORDS.length];

/** A small deterministic noise source (xorshift), for the hi-hat. */
function noise(seed) {
  let x = seed;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) / 0xffffffff) * 2 - 1;
  };
}

/** Linear envelope between points [[time, level], ...]. */
function envelope(points, t) {
  if (t <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [t1, v1] = points[i];
    const [t0, v0] = points[i - 1];
    if (t <= t1) return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
  }
  return points.at(-1)[1];
}

/**
 * Renders `seconds` of music and writes a 16-bit stereo WAV.
 * Sections follow the ad: calm intro, the beat from 7 s, hi-hat from 12 s, and a last
 * chord that rings out from 27 s.
 */
export function writeMusic(path, seconds = 30) {
  const length = Math.round(seconds * RATE);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  const hat = noise(0x5eed);
  const ending = 27;

  // Pad: detuned triangles per chord note, through a one-pole low-pass filter.
  const tri = (phase) => 1 - 4 * Math.abs(Math.round(phase - 0.25) - (phase - 0.25));
  let lpL = 0;
  let lpR = 0;
  for (let i = 0; i < length; i++) {
    const t = i / RATE;
    const chord = t < ending ? chordAt(t) : CHORDS[0];
    let l = 0;
    let r = 0;
    for (const note of chord.notes) {
      const f = hz(note);
      l += tri((f * 0.997 * t) % 1);
      r += tri((f * 1.003 * t) % 1);
    }
    const level = envelope(
      [
        [0, 0],
        [2, 0.075],
        [ending, 0.075],
        [ending + 0.3, 0.1],
        [seconds, 0],
      ],
      t,
    );
    const cutoff = 0.04 + 0.03 * Math.sin(t * 0.7);
    lpL += cutoff * (l * level - lpL);
    lpR += cutoff * (r * level - lpR);
    left[i] += lpL;
    right[i] += lpR;
  }

  /** Adds a note: `voice(age)` gives the sample `age` seconds after it starts. */
  const add = (start, duration, gainL, gainR, voice) => {
    const from = Math.round(start * RATE);
    const to = Math.min(length, Math.round((start + duration) * RATE));
    for (let i = Math.max(0, from); i < to; i++) {
      const v = voice((i - from) / RATE);
      left[i] += v * gainL;
      right[i] += v * gainR;
    }
  };

  const eighth = BEAT / 2;
  for (let step = 0; step * eighth < seconds; step++) {
    const t = step * eighth;
    const chord = chordAt(t);
    const onBeat = step % 2 === 0;
    const beat = Math.floor(step / 2);

    // Arpeggio (from 3 s): plucked sine with a soft octave, alternating sides.
    if (t >= 3 && t < ending) {
      const pattern = [0, 1, 2, 3, 2, 1, 2, 3];
      const f = hz(chord.notes[pattern[step % pattern.length]] + 12);
      const pan = step % 2 ? 0.7 : 1;
      add(t, 0.9, 0.12 * pan, 0.12 * (1.7 - pan), (a) => {
        const decay = Math.exp(-a * 5);
        return (Math.sin(2 * Math.PI * f * a) + 0.3 * Math.sin(4 * Math.PI * f * a)) * decay;
      });
    }

    if (t >= 7 && t < ending) {
      // Kick on every beat: a sine that drops from 120 to 45 Hz.
      if (onBeat) {
        add(t, 0.35, 0.32, 0.32, (a) => {
          const f = 45 + 75 * Math.exp(-a * 30);
          return Math.sin(2 * Math.PI * f * a) * Math.exp(-a * 9);
        });
      }
      // Bass on beats 1 and 3 of each bar.
      if (onBeat && beat % 2 === 0) {
        const f = hz(chord.root);
        add(t, BEAT * 1.8, 0.2, 0.2, (a) => {
          const env = Math.min(1, a * 60) * Math.exp(-a * 1.6);
          return (Math.sin(2 * Math.PI * f * a) + 0.25 * Math.sin(4 * Math.PI * f * a)) * env;
        });
      }
      // Hi-hat on the off-beats, from 12 s.
      if (!onBeat && t >= 12) {
        let prev = 0;
        add(t, 0.06, 0.035, 0.045, (a) => {
          const n = hat();
          const high = n - prev; // a crude high-pass
          prev = n;
          return high * Math.exp(-a * 70);
        });
      }
    }
  }

  // Last chord: a bell-like stab at 27 s.
  for (const note of CHORDS[0].notes) {
    const f = hz(note + 12);
    add(
      ending,
      seconds - ending,
      0.06,
      0.06,
      (a) => Math.sin(2 * Math.PI * f * a) * Math.exp(-a * 1.2),
    );
  }

  // Room: two feedback delays per side.
  const echo = (buffer, delays, feedback) => {
    for (const seconds of delays) {
      const d = Math.round(seconds * RATE);
      for (let i = d; i < length; i++) buffer[i] += buffer[i - d] * feedback;
    }
  };
  echo(left, [0.031, 0.047], 0.22);
  echo(right, [0.037, 0.053], 0.22);

  // Master: fades and normalization to -1 dBFS.
  let peak = 0;
  for (let i = 0; i < length; i++) {
    const t = i / RATE;
    const fade = Math.min(1, t / 0.5, (seconds - t) / 2.5);
    left[i] *= fade;
    right[i] *= fade;
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }
  const gain = (10 ** (-1 / 20) * 32767) / peak;

  const data = Buffer.alloc(length * 4);
  for (let i = 0; i < length; i++) {
    data.writeInt16LE(Math.round(left[i] * gain), i * 4);
    data.writeInt16LE(Math.round(right[i] * gain), i * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(2, 22); // stereo
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([header, data]));
}
