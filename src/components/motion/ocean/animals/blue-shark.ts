/*!
 * particle-ocean · https://github.com/ekazanec/particle-ocean
 * Copyright (c) 2026 Andrey Gurov · https://agurov.com
 * MIT licensed. If you ship something built on this, a link back is appreciated.
 */
/** Blue shark — long scythe pectorals, lateral wave. Port of blue-shark.html. */
import * as THREE from 'three';
import { makePoints, type Particle, type WorldCtx } from '@/components/motion/ocean/core';
import { APPEARANCE, mul, paramDefaults, PROPORTIONS, rhythm, SPEED, TURN, WAVE_AMP } from '@/components/motion/ocean/params';
import { Drive, Swimmer, body, fin, layoutWave } from '@/components/motion/ocean/swim';
import type { OceanAnimal, OceanParamDef } from '@/components/motion/ocean/types';

export const BLUE_SHARK_PARAMS: OceanParamDef[] = [
  SPEED, TURN,
  rhythm('Body wave rate', 'Rate of lateral body and tail bending'),
  WAVE_AMP,
  mul('gape', 'Jaw opening', 'How wide the jaw opens on the strike', 0.3, 2),
  ...PROPORTIONS, ...APPEARANCE,
];

export function makeBlueShark(world: WorldCtx): OceanAnimal {
  const L = 2.2;
  const cIndigo = new THREE.Color(0x2b4fd8), cDeep = new THREE.Color(0x14247a);
  const cSilver = new THREE.Color(0x9fb4d8), cBelly = new THREE.Color(0xdfe7f2);

  const P: Particle[] = [];
  body(P, { n: 3200, L, r: (u) => 0.125 * Math.pow(Math.sin(Math.PI * (0.07 + 0.88 * u)), 0.85),
    color: (u, a, rr) => {
      const c = new THREE.Color();
      if (Math.sin(a) < -0.45 && rr > 0.55) c.copy(cBelly).multiplyScalar(0.30);
      else if (Math.abs(Math.sin(a)) < 0.3) c.copy(cSilver).multiplyScalar(0.32);
      else c.copy(cIndigo).lerp(cDeep, Math.random() * 0.7).multiplyScalar(0.5);
      return c.multiplyScalar(0.8 + Math.random() * 0.4);
    } });
  for (let i = 0; i < 110; i++) {
    const t = Math.random();
    P.push({ u: 0.03, jw: t, lx0: (Math.random() - 0.5) * 0.08 * (1 - 0.3 * t), ly0: 0.82 + t * 0.22, lz0: -0.055 - Math.random() * 0.025,
      c: new THREE.Color().copy(cBelly).multiplyScalar(0.22 + Math.random() * 0.1) });
  }
  const finC = (s: number) => new THREE.Color().copy(cIndigo).lerp(cDeep, Math.random() * 0.6).multiplyScalar((0.45 + Math.random() * 0.25) * (1 - 0.3 * s));
  fin(P, { n: 300, u: 0.26, base: [-0.09, 0.55, -0.06], du: [-0.72, -0.66, -0.22], dv: [0, 1, 0], len: 0.66, chord: (s) => 0.075 * (1 - 0.55 * s), color: finC });
  fin(P, { n: 300, u: 0.26, base: [0.09, 0.55, -0.06], du: [0.72, -0.66, -0.22], dv: [0, 1, 0], len: 0.66, chord: (s) => 0.075 * (1 - 0.55 * s), color: finC });
  fin(P, { n: 240, u: 0.46, base: [0, 0.05, 0.11], du: [0, -0.48, 0.88], dv: [0, 1, 0], len: 0.30, chord: (s) => 0.11 * (1 - 0.75 * s), color: finC });
  fin(P, { n: 260, u: 1, base: [0, -1.08, 0], du: [0, -0.50, 0.87], dv: [0, 1, 0], len: 0.46, chord: (s) => 0.10 * (1 - 0.6 * s), color: finC, extra: { fl: 1 } });
  fin(P, { n: 140, u: 1, base: [0, -1.08, 0], du: [0, -0.44, -0.90], dv: [0, 1, 0], len: 0.24, chord: (s) => 0.075 * (1 - 0.6 * s), color: finC, extra: { fl: 1 } });
  for (const sgn of [-1, 1]) for (let i = 0; i < 16; i++) {
    P.push({ u: 0.06, lx0: sgn * (0.075 + (Math.random() - 0.5) * 0.01), ly0: 0.95 + (Math.random() - 0.5) * 0.02, lz0: 0.03 + (Math.random() - 0.5) * 0.012,
      c: new THREE.Color(0xffffff).multiplyScalar(0.5 + Math.random() * 0.3) });
  }

  const pts = makePoints(world, P, { size: 0.06 });
  const sw = new Swimmer({ turnK: 0.9, avMax: 1.0, bound: 6.5, vMax: 2.2, rollK: 1.5, rollMax: 0.8 });
  const drive = new Drive(sw, { sBase: 0.45, sGain: 1.0, fBase: 0.7, fGain: 0.6, strikeRange: 1.5, strikeBoost: 2.0 });
  const p = paramDefaults(BLUE_SHARK_PARAMS);

  return {
    cloud: pts,
    head: sw.head,
    p,
    update(cursor, dt, time) {
      sw.kSpeed = p.speed; sw.kTurn = p.turn; drive.kFreq = p.rhythm;
      drive.update(cursor, dt, time);
      const kWave = p.waveAmp, kGape = p.gape; // extraFn's own `p` is the particle
      layoutWave(pts, P, sw, { ph: drive.ph, amp: 0.13 * (0.5 + 0.5 * Math.min(1, drive.speed)) * kWave, kw: 5.4, axis: 'x', start: 0.35, pw: 1.6,
        sx: p.bodyWide, sy: p.bodyLen, sz: p.bodyThick,
        extraFn: (p, v) => {
          if (p.fl) v[0] += Math.sin(drive.ph * Math.PI * 2 - 5.4 + 0.8) * 0.05 * kWave * (p.s as number);
          if (p.jw !== undefined) { v[2] -= drive.strike * 0.15 * kGape * (p.jw as number); v[1] -= drive.strike * 0.04 * kGape * (p.jw as number); }
        } });
    },
    dispose() { world.scene.remove(pts.points); pts.geo.dispose(); pts.mat.dispose(); },
  };
}
