/**
 * Turns the full-viewport capture into a framed clip by TRACKING the creature
 * instead of guessing where it will swim: for each frame it finds the centroid
 * of the bright pixels (the creature is the only bright thing in the scene),
 * smooths that path so the virtual camera glides, and prints one ffmpeg crop
 * filter per frame.
 *
 *   node scripts/frame-follow.mjs <frames-dir> <out-dir>
 */
import { readdirSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const DIR = process.argv[2] ?? '/tmp/po-frames';
const OUT = process.argv[3] ?? '/tmp/po-follow';
const W = 1440, H = 810, CW = 1000, CH = 563, SW = 90, SH = 51;

const files = readdirSync(DIR).filter((f) => f.endsWith('.png')).sort();
const centres = files.map((f) => {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', join(DIR, f),
    '-vf', `scale=${SW}:${SH}`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
    { maxBuffer: 1 << 24 });
  let sx = 0, sy = 0, n = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const v = raw[i];
    if (v <= 105) continue;                 // backdrop and god rays sit below this
    const w = (v - 105) ** 2;               // weight toward the creature's core
    sx += (i % SW) * w; sy += Math.floor(i / SW) * w; n += w;
  }
  return n > 0 ? { x: (sx / n) * (W / SW), y: (sy / n) * (H / SH) } : null;
});

// fill gaps (a frame mid-morph can be genuinely dark), then smooth
let last = centres.find(Boolean) ?? { x: W / 2, y: H / 2 };
const filled = centres.map((c) => (c ? (last = c) : last));
const K = 9;
const smooth = filled.map((_, i) => {
  let x = 0, y = 0, n = 0;
  for (let j = Math.max(0, i - K); j <= Math.min(filled.length - 1, i + K); j += 1) {
    x += filled[j].x; y += filled[j].y; n += 1;
  }
  return { x: x / n, y: y / n };
});

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
files.forEach((f, i) => {
  const cx = Math.round(Math.min(W - CW, Math.max(0, smooth[i].x - CW / 2)));
  const cy = Math.round(Math.min(H - CH, Math.max(0, smooth[i].y - CH / 2)));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(DIR, f),
    '-vf', `crop=${CW}:${CH}:${cx}:${cy},scale=900:506:flags=lanczos`,
    join(OUT, f)]);
});
console.log(`framed ${files.length} frames into ${OUT}`);
