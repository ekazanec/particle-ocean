/*!
 * particle-ocean · https://github.com/ekazanec/particle-ocean
 * Copyright (c) 2026 Andrey Gurov · https://agurov.com
 * MIT licensed. If you ship something built on this, a link back is appreciated.
 */
/** Hammerhead — cephalofoil scan sweep, lateral wave. Port of hammerhead.html. */
import * as THREE from 'three';
import { makePoints, type Particle, type WorldCtx } from '@/components/motion/ocean/core';
import { APPEARANCE, mul, paramDefaults, PROPORTIONS, rhythm, SPEED, TURN, WAVE_AMP } from '@/components/motion/ocean/params';
import { Drive, Swimmer, body, fin, layoutWave } from '@/components/motion/ocean/swim';
import type { OceanAnimal, OceanParamDef } from '@/components/motion/ocean/types';

export const HAMMERHEAD_PARAMS: OceanParamDef[] = [
  SPEED, TURN,
  rhythm('Body wave rate', 'Rate of lateral body bending, and of the hammer scan'),
  WAVE_AMP,
  mul('scan', 'Hammer scan width', 'How far the hammer head sweeps side to side while searching', 0, 2.5),
  mul('gape', 'Jaw opening', 'How wide the jaw opens on the strike', 0.3, 2),
  ...PROPORTIONS, ...APPEARANCE,
];

export function makeHammerhead(world: WorldCtx): OceanAnimal {
  const L = 2.2;
  const cTop = new THREE.Color(0x5a7080), cDeep = new THREE.Color(0x2c3a46);
  const cBelly = new THREE.Color(0xc9d2d6), cEye = new THREE.Color(0xfff2c8);

  const P: Particle[] = [];
  body(P, { n: 3400, L, r: (u) => 0.155 * Math.pow(Math.sin(Math.PI * (0.10 + 0.85 * u)), 0.8),
    color: (u, a, rr) => {
      const c = new THREE.Color();
      if (Math.sin(a) < -0.5 && rr > 0.6) c.copy(cBelly).multiplyScalar(0.32);
      else c.copy(cTop).lerp(cDeep, Math.random() * 0.7).multiplyScalar(0.5);
      return c.multiplyScalar(0.8 + Math.random() * 0.4);
    } });
  // cephalofoil — wide flat bar with glowing eye tips
  for (let i = 0; i < 620; i++) {
    const s = Math.random() * 2 - 1, w = Math.random() * 2 - 1;
    const c = new THREE.Color();
    if (Math.abs(s) > 0.93) c.copy(cEye).multiplyScalar(0.6 + Math.random() * 0.3);
    else c.copy(cTop).lerp(cDeep, Math.random() * 0.6).multiplyScalar(0.45 + Math.random() * 0.25);
    P.push({ u: 0.02, lx0: s * 0.36, ly0: 1.10 + w * 0.055 * (1 - Math.abs(s) * 0.30) - Math.abs(s) * 0.05, lz0: (Math.random() - 0.5) * 0.035, c });
  }
  for (let i = 0; i < 120; i++) {
    const t = Math.random();
    P.push({ u: 0.04, jw: t, lx0: (Math.random() - 0.5) * 0.11 * (1 - 0.3 * t), ly0: 0.88 + t * 0.18, lz0: -0.07 - Math.random() * 0.03,
      c: new THREE.Color().copy(cBelly).multiplyScalar(0.24 + Math.random() * 0.12) });
  }
  const finC = (s: number) => new THREE.Color().copy(cTop).lerp(cDeep, Math.random() * 0.6).multiplyScalar((0.45 + Math.random() * 0.25) * (1 - 0.3 * s));
  fin(P, { n: 340, u: 0.35, base: [0, 0.30, 0.13], du: [0, -0.42, 0.91], dv: [0, 1, 0], len: 0.50, chord: (s) => 0.15 * (1 - 0.8 * s), color: finC });
  fin(P, { n: 200, u: 0.28, base: [-0.10, 0.48, -0.08], du: [-0.80, -0.45, -0.40], dv: [0, 1, 0], len: 0.34, chord: (s) => 0.10 * (1 - 0.6 * s), color: finC });
  fin(P, { n: 200, u: 0.28, base: [0.10, 0.48, -0.08], du: [0.80, -0.45, -0.40], dv: [0, 1, 0], len: 0.34, chord: (s) => 0.10 * (1 - 0.6 * s), color: finC });
  fin(P, { n: 280, u: 1, base: [0, -1.08, 0], du: [0, -0.48, 0.88], dv: [0, 1, 0], len: 0.55, chord: (s) => 0.11 * (1 - 0.65 * s), color: finC, extra: { fl: 1 } });
  fin(P, { n: 150, u: 1, base: [0, -1.08, 0], du: [0, -0.42, -0.91], dv: [0, 1, 0], len: 0.26, chord: (s) => 0.08 * (1 - 0.6 * s), color: finC, extra: { fl: 1 } });

  const pts = makePoints(world, P, { size: 0.065 });
  const sw = new Swimmer({ turnK: 1.1, avMax: 1.3, bound: 6.5, vMax: 2.6, rollK: 1.2 });
  const drive = new Drive(sw, { sBase: 0.45, sGain: 1.1, fBase: 0.9, fGain: 0.8, strikeRange: 1.4, strikeBoost: 2.0 });

  const p = paramDefaults(HAMMERHEAD_PARAMS);
  return {
    cloud: pts,
    head: sw.head,
    p,
    update(cursor, dt, time) {
      sw.kSpeed = p.speed; sw.kTurn = p.turn; drive.kFreq = p.rhythm;
      drive.update(cursor, dt, time);
      const kWave = p.waveAmp, kGape = p.gape; // extraFn's own `p` is the particle
      const scan = Math.sin(drive.ph * Math.PI * 2) * 0.05 * p.scan; // hammer scans side-to-side
      layoutWave(pts, P, sw, { ph: drive.ph, amp: 0.15 * (0.5 + 0.5 * Math.min(1, drive.speed)) * kWave, kw: 5.0, axis: 'x', start: 0.32, pw: 1.6,
        sx: p.bodyWide, sy: p.bodyLen, sz: p.bodyThick,
        extraFn: (p, v) => {
          const u = p.u as number;
          if (u < 0.1) v[0] += scan * (1 - u * 10);
          if (p.fl) v[0] += Math.sin(drive.ph * Math.PI * 2 - 5.0 + 0.8) * 0.06 * kWave * (p.s as number);
          if (p.jw !== undefined) { v[2] -= drive.strike * 0.16 * kGape * (p.jw as number); v[1] -= drive.strike * 0.04 * kGape * (p.jw as number); }
        } });
    },
    dispose() { world.scene.remove(pts.points); pts.geo.dispose(); pts.mat.dispose(); },
  };
}
