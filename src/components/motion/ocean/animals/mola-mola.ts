/** Mola mola — disc body, sculling dorsal/anal lobes, clavus rudder. Port of mola-mola.html. */
import * as THREE from 'three';
import { makePoints, place, type Particle, type WorldCtx } from '@/components/motion/ocean/core';
import { APPEARANCE, mul, paramDefaults, PROPORTIONS, rhythm, SPEED, TURN } from '@/components/motion/ocean/params';
import { Drive, Swimmer } from '@/components/motion/ocean/swim';
import type { OceanAnimal, OceanParamDef } from '@/components/motion/ocean/types';

export const MOLA_MOLA_PARAMS: OceanParamDef[] = [
  SPEED, TURN,
  rhythm('Stroke rate', 'How fast the dorsal and anal fins beat'),
  mul('finAmp', 'Rowing amplitude', 'How far the dorsal and anal fins travel', 0.3, 2.5),
  ...PROPORTIONS, ...APPEARANCE,
];

export function makeMolaMola(world: WorldCtx): OceanAnimal {
  const cGrey = new THREE.Color(0x7f8894), cDark = new THREE.Color(0x454e58);
  const cLight = new THREE.Color(0xb9c1c9), cFin = new THREE.Color(0x99a4b0);
  const cBlue = new THREE.Color(0x6d8098); // silvery blue-grey mid-tone

  const P: Particle[] = [];
  const EY = 0.60, EZ = 0.57;

  // ---- natural skin coloring (baked once — survives the hue/sat/bright
  // knobs, which regrade from the pristine attribute copy) -----------------
  // deterministic lattice hash → 2-octave value noise: the LOW-frequency
  // marbled blotches real Mola mola skin has (patches, not per-dot noise)
  const h2 = (x: number, y: number): number => {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const vn = (x: number, y: number): number => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return h2(xi, yi) * (1 - u) * (1 - v) + h2(xi + 1, yi) * u * (1 - v)
      + h2(xi, yi + 1) * (1 - u) * v + h2(xi + 1, yi + 1) * u * v;
  };
  /** Marble field in [-1, 1] over the disc plane (ly fore-aft, lz up-down). */
  const mottle = (y: number, z: number): number =>
    (vn(y * 2.6 + 7.3, z * 2.6 + 2.9) * 0.68 + vn(y * 5.8 + 13.7, z * 5.8 + 5.1) * 0.32) * 2 - 1;
  /**
   * Skin color at a local point: dark steel dorsum fading to pale silver
   * belly (smooth gradient — no hard border rows), marbled lighter/darker
   * blotches, granular per-particle shimmer and rare pale glints. Also used
   * by the fin/clavus bases so the attachments melt into the body.
   */
  const bodyCol = (ly: number, lz: number): THREE.Color => {
    const c = new THREE.Color();
    const g = THREE.MathUtils.clamp(0.5 - lz / (EZ * 1.6), 0, 1);
    const dv = g * g * (3 - 2 * g); // 0 = dorsal, 1 = ventral
    c.copy(cDark).lerp(cBlue, 0.30 + dv * 0.45).lerp(cLight, dv * dv * 0.55);
    const m = mottle(ly, lz);
    if (m > 0) c.lerp(cLight, Math.min(1, m * 0.65));
    else c.lerp(cDark, Math.min(1, -m * 0.75));
    let lum = 0.40 * (1 + 0.45 * m); // blotches modulate brightness too
    lum *= 0.76 + Math.random() * 0.48; // granular skin shimmer
    if (Math.random() < 0.045) { c.copy(cLight); lum = 0.24 + Math.random() * 0.14; } // glints
    return c.multiplyScalar(lum);
  };

  // disc body — plump oval, truncated aft (clavus)
  for (let i = 0; i < 4200; i++) {
    const phi = Math.random() * Math.PI * 2, rr = Math.pow(Math.random(), 0.6);
    const ly0 = Math.cos(phi) * rr * EY, lz0 = Math.sin(phi) * rr * EZ;
    if (ly0 < -0.40) continue;
    const q = 1 - (ly0 / EY) ** 2 - (lz0 / EZ) ** 2;
    const th = 0.19 * Math.sqrt(Math.max(0, q)) + 0.006;
    const lx0 = (Math.random() * 2 - 1) * th;
    const c = bodyCol(ly0, lz0);
    // subtle side sheen: skin-surface particles on the mid-flank catch light
    const skin = Math.min(1, Math.abs(lx0) / Math.max(th, 1e-3));
    if (skin > 0.75) c.multiplyScalar(1 + 0.22 * ((skin - 0.75) / 0.25) * (1 - Math.abs(ly0) / EY));
    P.push({ kind: 'b', lx0, ly0, lz0, c });
  }
  // clavus — scalloped rear edge; base tinted by the body's own skin color
  for (let i = 0; i < 600; i++) {
    const t = Math.random() * 2 - 1;
    const lz0 = t * 0.44;
    const scallop = 0.04 * Math.sin(t * 9);
    const d = Math.random();
    const bs = Math.min(1, d / 0.5);
    const c = bodyCol(-0.38, lz0 * 0.9).lerp(
      new THREE.Color().copy(cFin).lerp(cDark, Math.random() * 0.5).multiplyScalar((0.4 + Math.random() * 0.2) * (1 - 0.3 * d)),
      bs * bs * (3 - 2 * bs),
    );
    P.push({ kind: 'c', lx0: (Math.random() * 2 - 1) * 0.05 * (1 - d * 0.6), ly0: -0.40 - d * 0.09 + scallop * d, lz0, t, d, c });
  }
  // dorsal + anal lobes — the base DISSOLVES into the body: uniform-density
  // sampling (the old clamp of s ∈ [-0.12, 0) piled ~11% of particles into
  // one chord row at s = 0 — the visible "attachment line"), width matched
  // to the local body thickness, color/brightness blended from the body's
  // own skin over the first 45% of the span (additive stacking would ridge
  // at full brightness where fin flesh overlaps body flesh).
  const edge = EZ * Math.sqrt(Math.max(0, 1 - (0.10 / EY) ** 2));
  for (const sgnZ of [1, -1]) {
    for (let i = 0; i < 620; i++) {
      const ss = Math.pow(Math.random(), 0.8);
      const w = Math.random() * 2 - 1;
      const chord = 0.17 * Math.sqrt(Math.max(0.05, 1 - ss * ss * 0.9));
      const ly0 = -0.10 - ss * ss * 0.30 + w * chord;
      const lz0 = sgnZ * (edge - 0.10 + ss * 0.74);
      const b = Math.min(1, ss / 0.45);
      const bs = b * b * (3 - 2 * b); // 0 at the base → 1 on the free lobe
      // width: body's local half-thickness at the attach point → thin blade
      const qb = 1 - (ly0 / EY) ** 2 - (Math.min(Math.abs(lz0), EZ * 0.98) / EZ) ** 2;
      const thB = 0.19 * Math.sqrt(Math.max(0, qb)) + 0.006;
      const halfW = thB * (1 - bs) + 0.025 * bs * (1 - ss * 0.4);
      const c = bodyCol(ly0, THREE.MathUtils.clamp(lz0, -EZ * 0.98, EZ * 0.98));
      c.lerp(
        new THREE.Color().copy(cFin).lerp(cDark, Math.random() * 0.4).multiplyScalar((0.5 + Math.random() * 0.25) * (1 - 0.35 * ss)),
        bs,
      );
      c.multiplyScalar(0.45 + 0.55 * bs); // dim where fin overlaps body flesh
      P.push({ kind: 'f', lx0: (Math.random() * 2 - 1) * halfW, ly0, lz0, s: ss, w, c });
    }
  }
  for (const sgn of [-1, 1]) for (let i = 0; i < 14; i++) {
    P.push({ kind: 'b', lx0: sgn * (0.10 + (Math.random() - 0.5) * 0.01), ly0: 0.40 + (Math.random() - 0.5) * 0.02, lz0: 0.10 + (Math.random() - 0.5) * 0.02,
      c: new THREE.Color(0xffffff).multiplyScalar(0.5 + Math.random() * 0.3) });
  }
  for (let i = 0; i < 30; i++) {
    const a = Math.random() * Math.PI * 2;
    P.push({ kind: 'm', lx0: (Math.random() - 0.5) * 0.05, ly0: 0.585 + Math.cos(a) * 0.008, lz0: -0.02 + Math.sin(a) * 0.03,
      c: new THREE.Color().copy(cDark).multiplyScalar(0.5) });
  }

  const pts = makePoints(world, P, { size: 0.07 });
  const sw = new Swimmer({ turnK: 0.5, avMax: 0.45, bound: 6.5, vMax: 0.8, rollK: 0.5, rollMax: 0.3, drag: 0.55 });
  // avMax 0.45 / vMax 0.8 ⇒ turning radius ≈1.8 — the default slowR (2.2) barely
  // starts braking by the time it reaches that radius, so it settles into a
  // stable circling orbit around the cursor instead of closing in (measured:
  // never got closer than ~2.0 over 20s of active chase). slowR:6 starts the
  // deceleration far enough out that it's genuinely slow by radius ≈1.8.
  const drive = new Drive(sw, { sBase: 0.20, sGain: 0.4, fBase: 0.42, fGain: 0.3, thrK: 1.4, pulse: 0.28, strikeRange: 1.0, strikeBoost: 0.6, strikeCd: 2.5, slowR: 6 });

  const p = paramDefaults(MOLA_MOLA_PARAMS);
  return {
    cloud: pts,
    head: sw.head,
    p,
    update(cursor, dt, time) {
      sw.kSpeed = p.speed; sw.kTurn = p.turn; drive.kFreq = p.rhythm;
      drive.update(cursor, dt, time);
      const ph2 = drive.ph * Math.PI * 2;
      const cRock = Math.sin(ph2 - 0.9) * 0.05;
      const bob = Math.sin(time * 0.5) * 0.025;
      const kFin = p.finAmp; // dorsal/anal scull stroke width
      const kL = p.bodyLen, kW = p.bodyWide, kT = p.bodyThick; // «Proportions»
      const pos = pts.pos;
      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        let lx = p.lx0 as number, ly = p.ly0 as number, lz = p.lz0 as number;
        if (p.kind === 'f') {
          const s = p.s as number, w = p.w as number;
          const bend = Math.sin(ph2 - s * 1.5) * 0.34 * Math.pow(s, 1.15) * kFin;
          const twist = Math.sin(ph2 - s * 1.5 - 0.6) * 0.06 * s * w * kFin;
          lx += bend + twist;
        } else if (p.kind === 'c') {
          const d = p.d as number, t = p.t as number;
          lx += Math.sin(ph2 - 1.6 - d * 0.8) * 0.07 * (0.4 + 0.6 * d) + Math.sin(t * 5 + time * 1.1) * 0.01;
        } else if (p.kind === 'm') {
          const op = 1 + drive.strike * 1.6;
          ly = 0.585 + (ly - 0.585) * op + drive.strike * 0.04;
          lz = -0.02 + (lz + 0.02) * op;
        } else {
          lx += cRock * lz * 0.5;
        }
        lz += bob;
        place(pos, i, sw.head, sw.dir, sw.sideR, sw.upR, lx * kW, ly * kL, lz * kT);
      }
      pts.geo.attributes.position.needsUpdate = true;
    },
    dispose() { world.scene.remove(pts.points); pts.geo.dispose(); pts.mat.dispose(); },
  };
}
