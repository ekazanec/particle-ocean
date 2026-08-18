/** Dolphin — playful, body-bend into turns, jaw opens on strike. Port of dolphin.html. */
import * as THREE from 'three';
import { makePoints, type Particle, type WorldCtx } from '@/components/motion/ocean/core';
import { APPEARANCE, paramDefaults, PROPORTIONS, rhythm, SPEED, TURN, WAVE_AMP } from '@/components/motion/ocean/params';
import { Drive, Swimmer, body, fin, layoutWave } from '@/components/motion/ocean/swim';
import type { OceanAnimal, OceanParamDef } from '@/components/motion/ocean/types';

export const DOLPHIN_PARAMS: OceanParamDef[] = [
  SPEED, TURN,
  rhythm('Tail beat rate', 'Rate of vertical tail beats'),
  WAVE_AMP,
  { key: 'mouthSpeed', label: 'Mouth rate', desc: 'How fast the jaw opens on the strike and closes after', min: 0.3, max: 3, step: 0.05, def: 1 },
  { key: 'gape', label: 'Jaw opening', desc: 'How wide the lower jaw opens', min: 0.3, max: 2, step: 0.05, def: 1 },
  ...PROPORTIONS, ...APPEARANCE,
];

export function makeDolphin(world: WorldCtx): OceanAnimal {
  const L = 1.8;
  const cTop = new THREE.Color(0x5f7285), cDeep = new THREE.Color(0x37455a);
  const cSide = new THREE.Color(0x93a5b5), cBelly = new THREE.Color(0xe2e9ef);

  const P: Particle[] = [];
  body(P, { n: 3400, L, r: (u) => 0.165 * Math.pow(Math.sin(Math.PI * (0.13 + 0.80 * u)), 0.7),
    color: (u, a, rr) => {
      const c = new THREE.Color();
      if (Math.sin(a) < -0.5 && rr > 0.55) c.copy(cBelly).multiplyScalar(0.30);
      else if (Math.abs(Math.sin(a)) < 0.35) c.copy(cSide).multiplyScalar(0.35);
      else c.copy(cTop).lerp(cDeep, Math.random() * 0.6).multiplyScalar(0.5);
      return c.multiplyScalar(0.8 + Math.random() * 0.4);
    } });
  // rostrum
  for (let i = 0; i < 180; i++) {
    const d = Math.random(), a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random());
    const rad = 0.045 * (1 - 0.55 * d);
    P.push({ u: 0, lx0: Math.cos(a) * rr * rad, ly0: 0.86 + d * 0.22, lz0: Math.sin(a) * rr * rad - 0.02,
      c: new THREE.Color().copy(cSide).lerp(cDeep, Math.random() * 0.5).multiplyScalar(0.4 * (1 - 0.3 * d) + 0.1) });
  }
  for (const sgn of [-1, 1]) for (let i = 0; i < 14; i++) {
    P.push({ u: 0.05, lx0: sgn * (0.10 + (Math.random() - 0.5) * 0.01), ly0: 0.72 + (Math.random() - 0.5) * 0.02, lz0: 0.01 + (Math.random() - 0.5) * 0.012,
      c: new THREE.Color(0xffffff).multiplyScalar(0.5 + Math.random() * 0.3) });
  }
  // lower jaw — opens on strike
  for (let i = 0; i < 110; i++) {
    const t = Math.random();
    P.push({ u: 0, jw: t, lx0: (Math.random() - 0.5) * 0.05 * (1 - 0.4 * t), ly0: 0.80 + t * 0.28, lz0: -0.045 - Math.random() * 0.02,
      c: new THREE.Color().copy(cSide).multiplyScalar(0.30 + Math.random() * 0.15) });
  }
  const finC = (s: number) => new THREE.Color().copy(cTop).lerp(cDeep, Math.random() * 0.6).multiplyScalar((0.45 + Math.random() * 0.25) * (1 - 0.3 * s));
  fin(P, { n: 280, u: 0.45, base: [0, 0.06, 0.13], du: [0, -0.52, 0.85], dv: [0, 1, 0], len: 0.32, chord: (s) => 0.13 * (1 - 0.78 * s), color: finC });
  fin(P, { n: 180, u: 0.22, base: [-0.10, 0.48, -0.09], du: [-0.78, -0.45, -0.44], dv: [0, 1, 0], len: 0.26, chord: (s) => 0.09 * (1 - 0.6 * s), color: finC });
  fin(P, { n: 180, u: 0.22, base: [0.10, 0.48, -0.09], du: [0.78, -0.45, -0.44], dv: [0, 1, 0], len: 0.26, chord: (s) => 0.09 * (1 - 0.6 * s), color: finC });
  fin(P, { n: 220, u: 1, base: [0, -0.88, 0], du: [-0.92, -0.36, 0.04], dv: [0, 1, 0], len: 0.30, chord: (s) => 0.09 * (1 - 0.6 * s), color: finC, extra: { fl: 1 } });
  fin(P, { n: 220, u: 1, base: [0, -0.88, 0], du: [0.92, -0.36, 0.04], dv: [0, 1, 0], len: 0.30, chord: (s) => 0.09 * (1 - 0.6 * s), color: finC, extra: { fl: 1 } });

  const pts = makePoints(world, P, { size: 0.06 });
  const sw = new Swimmer({ turnK: 3.4, avMax: 3.8, bound: 6.5, vMax: 3.2, rollK: 1.5, rollMax: 1.0 });
  const drive = new Drive(sw, { sBase: 0.6, sGain: 1.5, fBase: 1.0, fGain: 0.8, strikeRange: 1.9, strikeBoost: 2.8, strikeCd: 1.0 });

  let bend = 0, mouth = 0;
  const p = paramDefaults(DOLPHIN_PARAMS);
  return {
    cloud: pts,
    head: sw.head,
    p,
    update(cursor, dt, time) {
      sw.kSpeed = p.speed; sw.kTurn = p.turn; drive.kFreq = p.rhythm;
      drive.update(cursor, dt, time);
      bend += (THREE.MathUtils.clamp(sw.turn * 2.4, -0.55, 0.55) - bend) * (1 - Math.pow(0.04, dt));
      const mTarget = drive.strike > 0.05 ? 1 : drive.dist < 0.9 ? 0.8 : 0;
      // visible jaw animation (was a ~0.15s snap): open over ~0.22s, close
      // over ~0.6s at 1×; «Mouth rate» scales both half-lives
      const mHalf = (mTarget > mouth ? 0.22 : 0.6) / p.mouthSpeed;
      mouth += (mTarget - mouth) * (1 - Math.pow(0.5, dt / mHalf));
      const bob = Math.sin(time * 0.9) * 0.02;
      const gape = p.gape; // captured: extraFn's own `p` is the particle
      const kWave = p.waveAmp; // body-bend force + tail-fluke flutter
      layoutWave(pts, P, sw, { ph: drive.ph, amp: 0.30 * (0.5 + 0.5 * Math.min(1, drive.speed)) * kWave, kw: 4.2, axis: 'z', start: 0.28, pw: 1.5,
        sx: p.bodyWide, sy: p.bodyLen, sz: p.bodyThick,
        extraFn: (p, v) => {
          v[2] += bob;
          v[0] += bend * Math.pow(Math.max(0, (p.u as number) - 0.10), 1.6) * 1.1;
          if (p.fl) v[2] += Math.sin(drive.ph * Math.PI * 2 - 4.2 + 0.9) * 0.06 * kWave * (p.s as number);
          if (p.jw !== undefined) { v[2] -= mouth * 0.20 * gape * (p.jw as number); v[1] -= mouth * 0.05 * gape * (p.jw as number); }
        } });
    },
    dispose() { world.scene.remove(pts.points); pts.geo.dispose(); pts.mat.dispose(); },
  };
}
