/*!
 * particle-ocean · https://github.com/ekazanec/particle-ocean
 * Copyright (c) 2026 Andrey Gurov · https://agurov.com
 * MIT licensed. If you ship something built on this, a link back is appreciated.
 */
/** Sailfish — sail unfurls on the hunt, bill quivers on strike. Port of sailfish.html. */
import * as THREE from 'three';
import { makePoints, type Particle, type WorldCtx } from '@/components/motion/ocean/core';
import { APPEARANCE, mul, paramDefaults, PROPORTIONS, rhythm, SPEED, TURN, WAVE_AMP } from '@/components/motion/ocean/params';
import { Drive, Swimmer, body, fin, layoutWave } from '@/components/motion/ocean/swim';
import type { OceanAnimal, OceanParamDef } from '@/components/motion/ocean/types';

export const SAILFISH_PARAMS: OceanParamDef[] = [
  SPEED, TURN,
  rhythm('Tail beat rate', 'Rate of lateral tail beats'),
  WAVE_AMP,
  mul('sail', 'Sail deployment', 'How readily the sailfish raises its dorsal sail'),
  mul('billQuiver', 'Bill tremor', 'Bill vibration amplitude on the strike', 0, 2.5),
  ...PROPORTIONS, ...APPEARANCE,
];

export function makeSailfish(world: WorldCtx): OceanAnimal {
  const L = 2.4;
  const cCobalt = new THREE.Color(0x1f47b8), cDeep = new THREE.Color(0x0e2266);
  const cSilver = new THREE.Color(0xc7d3dd), cBar = new THREE.Color(0x6fa8e8), cSail = new THREE.Color(0x24418f);

  const P: Particle[] = [];
  body(P, { n: 3000, L, r: (u) => 0.145 * Math.pow(Math.sin(Math.PI * (0.06 + 0.90 * u)), 0.85),
    color: (u, a, rr) => {
      const c = new THREE.Color();
      if (Math.sin(a) < -0.35 && rr > 0.55) c.copy(cSilver).multiplyScalar(0.30);
      else {
        c.copy(cCobalt).lerp(cDeep, Math.random() * 0.7).multiplyScalar(0.5);
        if (rr > 0.8 && Math.abs(Math.sin(u * 46)) > 0.94) c.copy(cBar).multiplyScalar(0.35);
      }
      return c.multiplyScalar(0.8 + Math.random() * 0.4);
    } });
  // bill (rostrum)
  for (let i = 0; i < 220; i++) {
    const d = Math.random();
    P.push({ u: 0, bill: d, lx0: (Math.random() - 0.5) * 0.016 * (1 - d), ly0: 1.18 + d * 0.46, lz0: (Math.random() - 0.5) * 0.016 * (1 - d) + 0.01,
      c: new THREE.Color().copy(cDeep).lerp(cSilver, 0.3).multiplyScalar(0.4 * (1 - 0.4 * d) + 0.15) });
  }
  // the SAIL — giant dorsal, scaled by sailUp at runtime
  for (let i = 0; i < 900; i++) {
    const s = Math.random(), h = Math.pow(Math.random(), 0.8);
    const u = 0.16 + s * 0.48;
    const H = 0.52 * Math.sin(Math.PI * (0.12 + 0.82 * s));
    const c = new THREE.Color();
    if (Math.random() < 0.12) c.copy(cDeep).multiplyScalar(0.5);
    else c.copy(cSail).lerp(cCobalt, Math.random() * 0.5).multiplyScalar(0.4);
    c.multiplyScalar((0.7 + Math.random() * 0.4) * (1 - 0.25 * h));
    P.push({ u, lx0: (Math.random() - 0.5) * 0.02, ly0: (0.5 - u) * L, lz0: 0, sailH: 0.10 + h * H, sailS: s, c });
  }
  const finC = (s: number) => new THREE.Color().copy(cCobalt).lerp(cDeep, Math.random() * 0.6).multiplyScalar((0.45 + Math.random() * 0.25) * (1 - 0.3 * s));
  fin(P, { n: 90, u: 0.24, base: [-0.03, 0.60, -0.11], du: [-0.06, -0.45, -0.89], dv: [0, 1, 0], len: 0.34, chord: () => 0.015, color: finC });
  fin(P, { n: 90, u: 0.24, base: [0.03, 0.60, -0.11], du: [0.06, -0.45, -0.89], dv: [0, 1, 0], len: 0.34, chord: () => 0.015, color: finC });
  fin(P, { n: 280, u: 1, base: [0, -1.16, 0], du: [0, -0.42, 0.91], dv: [0, -0.6, -0.5], len: 0.52, chord: (s) => 0.06 * (1 - 0.4 * s), color: finC, extra: { fl: 1 } });
  fin(P, { n: 280, u: 1, base: [0, -1.16, 0], du: [0, -0.42, -0.91], dv: [0, -0.6, 0.5], len: 0.52, chord: (s) => 0.06 * (1 - 0.4 * s), color: finC, extra: { fl: 1 } });

  const pts = makePoints(world, P, { size: 0.06 });
  const sw = new Swimmer({ turnK: 1.2, avMax: 1.4, bound: 6.5, vMax: 3.2, rollK: 1.3, rollMax: 0.75 });
  const drive = new Drive(sw, { sBase: 0.5, sGain: 1.6, fBase: 1.1, fGain: 1.0, strikeRange: 1.8, strikeBoost: 2.6, strikeCd: 1.4 });

  let sailUp = 0.5;
  const p = paramDefaults(SAILFISH_PARAMS);
  return {
    cloud: pts,
    head: sw.head,
    p,
    update(cursor, dt, time) {
      sw.kSpeed = p.speed; sw.kTurn = p.turn; drive.kFreq = p.rhythm;
      drive.update(cursor, dt, time);
      // sail: folded at cruise, spread on manoeuvre + attack
      const sailTarget = Math.min(1, (0.25 + drive.strike * 1.2 + Math.abs(sw.turn) * 2.5 + (1 - drive.frenzy) * 0.35) * p.sail);
      sailUp += (sailTarget - sailUp) * (1 - Math.pow(0.1, dt));
      const kWave = p.waveAmp, kQuiver = p.billQuiver; // extraFn's own `p` is the particle
      layoutWave(pts, P, sw, { ph: drive.ph, amp: 0.10 * (0.5 + 0.5 * Math.min(1, drive.speed)) * kWave, kw: 5.6, axis: 'x', start: 0.40, pw: 1.6, ctx: time,
        sx: p.bodyWide, sy: p.bodyLen, sz: p.bodyThick,
        extraFn: (p, v, ctx) => {
          if (p.sailH !== undefined) v[2] = 0.10 + ((p.sailH as number) - 0.10) * sailUp + 0.145 * 0.8;
          if (p.fl) v[0] += Math.sin(drive.ph * Math.PI * 2 - 5.6 + 0.8) * 0.07 * kWave * (p.s as number);
          if (p.bill !== undefined) v[0] += drive.strike * Math.sin((ctx ?? 0) * 15) * 0.11 * kQuiver * (p.bill as number);
        } });
    },
    dispose() { world.scene.remove(pts.points); pts.geo.dispose(); pts.mat.dispose(); },
  };
}
