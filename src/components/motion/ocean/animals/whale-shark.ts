/** Whale shark — checker spots, slow heterocercal cruise. Port of whale-shark.html. */
import * as THREE from 'three';
import { makePoints, type Particle, type WorldCtx } from '@/components/motion/ocean/core';
import { APPEARANCE, mul, paramDefaults, PROPORTIONS, rhythm, SPEED, TURN, WAVE_AMP } from '@/components/motion/ocean/params';
import { Drive, Swimmer, body, fin, layoutWave } from '@/components/motion/ocean/swim';
import type { OceanAnimal, OceanParamDef } from '@/components/motion/ocean/types';

export const WHALE_SHARK_PARAMS: OceanParamDef[] = [
  SPEED, TURN,
  rhythm('Body wave rate', 'Rate of the slow lateral body bend'),
  WAVE_AMP,
  mul('gape', 'Jaw opening', 'How wide the filter mouth opens on the strike', 0.3, 2),
  ...PROPORTIONS, ...APPEARANCE,
];

export function makeWhaleShark(world: WorldCtx): OceanAnimal {
  const L = 3.0;
  const cBase = new THREE.Color(0x3a5566), cDeep = new THREE.Color(0x1c2f3d);
  const cSpot = new THREE.Color(0xe8e4c8), cBelly = new THREE.Color(0xb9c4c2);

  const P: Particle[] = [];
  body(P, { n: 4600, L, r: (u) => 0.34 * Math.pow(Math.sin(Math.PI * (0.14 + 0.80 * u)), 0.8),
    flat: (u) => 1.12 - 0.15 * u,
    color: (u, a, rr) => {
      const c = new THREE.Color();
      if (Math.sin(a) < -0.55 && rr > 0.6) c.copy(cBelly).multiplyScalar(0.32);
      else {
        c.copy(cBase).lerp(cDeep, Math.random() * 0.7).multiplyScalar(0.5);
        if (Math.sin(a) > -0.3 && rr > 0.8 && Math.random() < 0.15) c.copy(cSpot).multiplyScalar(0.45);
        if (Math.sin(a) > 0.6 && rr > 0.85 && Math.abs(Math.cos(a)) < 0.12) c.copy(cSpot).multiplyScalar(0.3);
      }
      return c.multiplyScalar(0.8 + Math.random() * 0.4);
    } });
  for (let i = 0; i < 220; i++) {
    const t = Math.random();
    P.push({ u: 0.02, jw: t, lx0: (Math.random() - 0.5) * 0.44 * (1 - 0.25 * t), ly0: 1.26 + t * 0.26, lz0: -0.09 - Math.random() * 0.05,
      c: new THREE.Color().copy(cBelly).multiplyScalar(0.22 + Math.random() * 0.1) });
  }
  const finC = (s: number) => new THREE.Color().copy(cBase).lerp(cDeep, Math.random() * 0.6).multiplyScalar((0.45 + Math.random() * 0.25) * (1 - 0.3 * s));
  fin(P, { n: 340, u: 0.55, base: [0, -0.15, 0.30], du: [0, -0.40, 0.92], dv: [0, 1, 0], len: 0.44, chord: (s) => 0.20 * (1 - 0.75 * s), color: finC });
  fin(P, { n: 120, u: 0.80, base: [0, -0.92, 0.14], du: [0, -0.45, 0.89], dv: [0, 1, 0], len: 0.17, chord: (s) => 0.09 * (1 - 0.7 * s), color: finC });
  fin(P, { n: 300, u: 0.30, base: [-0.28, 0.55, -0.14], du: [-0.80, -0.42, -0.42], dv: [0, 1, 0], len: 0.58, chord: (s) => 0.16 * (1 - 0.6 * s), color: finC });
  fin(P, { n: 300, u: 0.30, base: [0.28, 0.55, -0.14], du: [0.80, -0.42, -0.42], dv: [0, 1, 0], len: 0.58, chord: (s) => 0.16 * (1 - 0.6 * s), color: finC });
  fin(P, { n: 320, u: 1, base: [0, -1.48, 0], du: [0, -0.42, 0.91], dv: [0, 1, 0], len: 0.66, chord: (s) => 0.13 * (1 - 0.6 * s), color: finC, extra: { fl: 1 } });
  fin(P, { n: 170, u: 1, base: [0, -1.48, 0], du: [0, -0.40, -0.92], dv: [0, 1, 0], len: 0.32, chord: (s) => 0.10 * (1 - 0.6 * s), color: finC, extra: { fl: 1 } });

  const pts = makePoints(world, P, { size: 0.075 });
  const sw = new Swimmer({ turnK: 0.55, avMax: 0.5, bound: 6.5, vMax: 1.1, rollK: 0.7, rollMax: 0.35 });
  const drive = new Drive(sw, { sBase: 0.28, sGain: 0.55, fBase: 0.35, fGain: 0.35, pulse: 0.25, strikeRange: 1.2, strikeBoost: 0.9, strikeCd: 2.2 });

  const p = paramDefaults(WHALE_SHARK_PARAMS);
  return {
    cloud: pts,
    head: sw.head,
    p,
    update(cursor, dt, time) {
      sw.kSpeed = p.speed; sw.kTurn = p.turn; drive.kFreq = p.rhythm;
      drive.update(cursor, dt, time);
      const kWave = p.waveAmp, kGape = p.gape; // extraFn's own `p` is the particle
      layoutWave(pts, P, sw, { ph: drive.ph, amp: 0.14 * kWave, kw: 3.8, axis: 'x', start: 0.30, pw: 1.5,
        sx: p.bodyWide, sy: p.bodyLen, sz: p.bodyThick,
        extraFn: (p, v) => {
          if (p.fl) v[0] += Math.sin(drive.ph * Math.PI * 2 - 3.8 + 0.8) * 0.06 * kWave * (p.s as number);
          if (p.jw !== undefined) { v[2] -= drive.strike * 0.30 * kGape * (p.jw as number); v[1] -= drive.strike * 0.05 * kGape * (p.jw as number); }
        } });
    },
    dispose() { world.scene.remove(pts.points); pts.geo.dispose(); pts.mat.dispose(); },
  };
}
