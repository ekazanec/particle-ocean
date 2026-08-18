/** Orca — eye patch + saddle, vertical (cetacean) wave. Port of orca.html. */
import * as THREE from 'three';
import { makePoints, type Particle, type WorldCtx } from '@/components/motion/ocean/core';
import { APPEARANCE, mul, paramDefaults, PROPORTIONS, rhythm, SPEED, TURN, WAVE_AMP } from '@/components/motion/ocean/params';
import { Drive, Swimmer, body, fin, layoutWave } from '@/components/motion/ocean/swim';
import type { OceanAnimal, OceanParamDef } from '@/components/motion/ocean/types';

export const ORCA_PARAMS: OceanParamDef[] = [
  SPEED, TURN,
  rhythm('Tail beat rate', 'Rate of vertical caudal fin beats'),
  WAVE_AMP,
  mul('gape', 'Jaw opening', 'How wide the jaw opens on the strike', 0.3, 2),
  ...PROPORTIONS, ...APPEARANCE,
];

export function makeOrca(world: WorldCtx): OceanAnimal {
  const L = 2.4;
  const cBlack = new THREE.Color(0x1a2230), cDeep = new THREE.Color(0x0c1018);
  const cWhite = new THREE.Color(0xdde6ee), cGrey = new THREE.Color(0x8b98a6);

  const P: Particle[] = [];
  body(P, { n: 4200, L, r: (u) => 0.30 * Math.pow(Math.sin(Math.PI * (0.10 + 0.86 * u)), 0.7),
    color: (u, a, rr) => {
      const c = new THREE.Color();
      const belly = Math.sin(a) < -0.45 && u < 0.86;
      const chin = u < 0.14 && Math.sin(a) < 0.1;
      const eyePatch = Math.abs(Math.cos(a)) > 0.72 && Math.sin(a) > 0.25 && Math.sin(a) < 0.8 && u > 0.10 && u < 0.19 && rr > 0.8;
      const saddle = u > 0.48 && u < 0.64 && Math.sin(a) > 0.45 && rr > 0.75 && Math.random() < 0.7;
      if (eyePatch || ((belly || chin) && rr > 0.7)) c.copy(cWhite).multiplyScalar(0.5);
      else if (saddle) c.copy(cGrey).multiplyScalar(0.4);
      else c.copy(cBlack).lerp(cDeep, Math.random() * 0.7).multiplyScalar(0.55);
      return c.multiplyScalar(0.8 + Math.random() * 0.4);
    } });
  for (let i = 0; i < 160; i++) {
    const t = Math.random();
    P.push({ u: 0.02, jw: t, lx0: (Math.random() - 0.5) * 0.16 * (1 - 0.3 * t), ly0: 0.92 + t * 0.28, lz0: -0.10 - Math.random() * 0.045,
      c: new THREE.Color().copy(cWhite).multiplyScalar(0.28 + Math.random() * 0.14) });
  }
  const finC = (s: number) => new THREE.Color().copy(cBlack).lerp(cDeep, Math.random() * 0.5).multiplyScalar((0.5 + Math.random() * 0.3) * (1 - 0.3 * s));
  fin(P, { n: 420, u: 0.46, base: [0, 0.10, 0.24], du: [0, -0.22, 0.97], dv: [0, 1, 0], len: 0.62, chord: (s) => 0.17 * (1 - 0.72 * s), color: finC });
  fin(P, { n: 260, u: 0.22, base: [-0.15, 0.66, -0.14], du: [-0.82, -0.35, -0.45], dv: [0, 1, 0], len: 0.44, chord: (s) => 0.16 * Math.sin(Math.PI * Math.min(1, 0.2 + 0.8 * (1 - s * 0.85))), color: finC });
  fin(P, { n: 260, u: 0.22, base: [0.15, 0.66, -0.14], du: [0.82, -0.35, -0.45], dv: [0, 1, 0], len: 0.44, chord: (s) => 0.16 * Math.sin(Math.PI * Math.min(1, 0.2 + 0.8 * (1 - s * 0.85))), color: finC });
  fin(P, { n: 260, u: 1, base: [0, -1.18, 0], du: [-0.92, -0.38, 0.03], dv: [0, 1, 0], len: 0.38, chord: (s) => 0.11 * (1 - 0.65 * s), color: finC, extra: { fl: 1 } });
  fin(P, { n: 260, u: 1, base: [0, -1.18, 0], du: [0.92, -0.38, 0.03], dv: [0, 1, 0], len: 0.38, chord: (s) => 0.11 * (1 - 0.65 * s), color: finC, extra: { fl: 1 } });

  const pts = makePoints(world, P, { size: 0.07 });
  const sw = new Swimmer({ turnK: 0.9, avMax: 0.95, bound: 6.5, vMax: 2.4, rollK: 1.0 });
  const drive = new Drive(sw, { sBase: 0.5, sGain: 1.0, fBase: 0.6, fGain: 0.55, strikeRange: 1.6, strikeBoost: 1.9 });

  const p = paramDefaults(ORCA_PARAMS);
  return {
    cloud: pts,
    head: sw.head,
    p,
    update(cursor, dt, time) {
      sw.kSpeed = p.speed; sw.kTurn = p.turn; drive.kFreq = p.rhythm;
      drive.update(cursor, dt, time);
      const kWave = p.waveAmp, kGape = p.gape; // extraFn's own `p` is the particle
      layoutWave(pts, P, sw, { ph: drive.ph, amp: 0.15 * (0.5 + 0.5 * Math.min(1, drive.speed)) * kWave, kw: 4.3, axis: 'z', start: 0.38, pw: 1.7,
        sx: p.bodyWide, sy: p.bodyLen, sz: p.bodyThick,
        extraFn: (p, v) => {
          if (p.fl) v[2] += Math.sin(drive.ph * Math.PI * 2 - 4.3 + 0.9) * 0.05 * kWave * (p.s as number);
          if (p.jw !== undefined) { v[2] -= drive.strike * 0.26 * kGape * (p.jw as number); v[1] -= drive.strike * 0.06 * kGape * (p.jw as number); }
        } });
    },
    dispose() { world.scene.remove(pts.points); pts.geo.dispose(); pts.mat.dispose(); },
  };
}
