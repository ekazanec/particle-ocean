/*!
 * particle-ocean · https://github.com/ekazanec/particle-ocean
 * Copyright (c) 2026 Andrey Gurov · https://agurov.com
 * MIT licensed. If you ship something built on this, a link back is appreciated.
 */
/** Leafy seadragon — curved seahorse spine, leaf camouflage, slow drift. Port of leafy-seadragon.html. */
import * as THREE from 'three';
import { makePoints, place, type Particle, type WorldCtx } from '@/components/motion/ocean/core';
import { APPEARANCE, mul, paramDefaults, PROPORTIONS, SPEED, TURN } from '@/components/motion/ocean/params';
import { Swimmer } from '@/components/motion/ocean/swim';
import type { OceanAnimal, OceanParamDef } from '@/components/motion/ocean/types';

export const LEAFY_SEADRAGON_PARAMS: OceanParamDef[] = [
  SPEED, TURN,
  mul('sway', 'Sway rate', 'Rate of body, leaf and finlet sway'),
  ...PROPORTIONS, ...APPEARANCE,
];

export function makeLeafySeadragon(world: WorldCtx): OceanAnimal {
  const cBody = new THREE.Color(0x9aa04a), cRidge = new THREE.Color(0x5c6128);
  const cLeaf = new THREE.Color(0xcfd76a), cRim = new THREE.Color(0xe8e0a0);

  const SP: Array<[number, number, number]> = [
    [0.58, 0.28, 0.012], [0.44, 0.31, 0.02], [0.30, 0.34, 0.032], [0.16, 0.27, 0.045], [0.06, 0.10, 0.055],
    [0.04, -0.08, 0.052], [0.10, -0.26, 0.04], [0.22, -0.40, 0.026], [0.36, -0.48, 0.014], [0.46, -0.50, 0.007],
  ];
  function sampleSpine(t: number): [number, number, number] {
    const f = t * (SP.length - 1), i0 = Math.min(SP.length - 2, Math.floor(f)), ff = f - i0;
    const a = SP[i0], b = SP[i0 + 1];
    return [a[0] + (b[0] - a[0]) * ff, a[1] + (b[1] - a[1]) * ff, a[2] + (b[2] - a[2]) * ff];
  }

  const P: Particle[] = [];
  for (let i = 0; i < 1600; i++) {
    const t = Math.random();
    const [ly, lz, r] = sampleSpine(t);
    const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random());
    const c = new THREE.Color();
    const ring = Math.abs(Math.sin(t * 34)) > 0.88;
    if (ring) c.copy(cRidge).multiplyScalar(0.5);
    else c.copy(cBody).lerp(cRidge, Math.random() * 0.5).multiplyScalar(0.45);
    if (Math.random() < 0.07) c.copy(cRim).multiplyScalar(0.35);
    c.multiplyScalar(0.8 + Math.random() * 0.4);
    P.push({ kind: 'b', bt: t, lx0: Math.cos(a) * rr * r, ly0: ly + Math.sin(a) * rr * r * 0.2, lz0: lz + Math.sin(a) * rr * r, c });
  }
  for (let i = 0; i < 120; i++) {
    const d = Math.random();
    P.push({ kind: 'b', bt: 0, lx0: (Math.random() - 0.5) * 0.014, ly0: 0.58 + d * 0.16, lz0: 0.28 - d * 0.015 + (Math.random() - 0.5) * 0.014,
      c: new THREE.Color().copy(cBody).lerp(cRim, 0.4).multiplyScalar(0.4 * (1 - 0.3 * d) + 0.12) });
  }
  for (const sgn of [-1, 1]) for (let i = 0; i < 8; i++) {
    P.push({ kind: 'b', bt: 0.04, lx0: sgn * 0.028, ly0: 0.50 + (Math.random() - 0.5) * 0.01, lz0: 0.315 + (Math.random() - 0.5) * 0.01,
      c: new THREE.Color(0xffffff).multiplyScalar(0.55 + Math.random() * 0.3) });
  }
  const LEAVES: Array<[number, number, number]> = [
    [0.06, 1.9, 0.24], [0.14, 1.2, 0.30], [0.22, 0.9, 0.26], [0.30, 2.6, 0.22], [0.42, -2.6, 0.26], [0.50, -2.2, 0.30],
    [0.60, -1.9, 0.28], [0.70, -1.4, 0.30], [0.80, -1.0, 0.26], [0.88, -0.6, 0.22], [0.36, 0.5, 0.20],
  ];
  LEAVES.forEach(([t, ang, len], li) => {
    const [by, bz] = sampleSpine(t);
    const dy = Math.cos(ang), dz = Math.sin(ang);
    const py = -dz, pz = dy;
    const sd = (li % 2 ? 1 : -1) * (0.30 + (li * 37 % 10) / 10 * 0.35);
    const cf = Math.cos(sd), sf = Math.sin(sd);
    for (let i = 0; i < 110; i++) {
      const s = Math.pow(Math.random(), 0.8), w = Math.random() * 2 - 1;
      const ch = 0.055 * Math.sin(Math.PI * Math.min(1, 0.15 + 0.85 * s));
      const c = new THREE.Color();
      if (Math.abs(w) > 0.7 || s > 0.9) c.copy(cRim).multiplyScalar(0.35);
      else c.copy(cLeaf).lerp(cBody, Math.random() * 0.5).multiplyScalar(0.28);
      c.multiplyScalar(0.8 + Math.random() * 0.4);
      P.push({ kind: 'l', li, s, bt: t,
        ly0: by + dy * s * len * cf + py * w * ch,
        lz0: bz + dz * s * len * cf + pz * w * ch,
        lx0: sf * s * len + (Math.random() - 0.5) * 0.03,
        pdy: py, pdz: pz, c });
    }
  });
  for (const sgn of [-1, 1]) for (let i = 0; i < 70; i++) {
    const s = Math.random(), w = Math.random();
    P.push({ kind: 'p', s, bt: 0.16, ly0: 0.34 - w * 0.05, lz0: 0.30 + s * 0.07, lx0: sgn * (0.03 + s * 0.045) + (Math.random() - 0.5) * 0.012,
      c: new THREE.Color().copy(cRim).multiplyScalar(0.22 + 0.2 * s) });
  }
  for (let i = 0; i < 130; i++) {
    const s = Math.random(), h = Math.random();
    const t = 0.45 + s * 0.25;
    const [ly, lz] = sampleSpine(t);
    P.push({ kind: 'd', s, h, bt: t, ly0: ly - 0.02, lz0: lz - 0.05 - h * 0.07, lx0: (Math.random() - 0.5) * 0.015,
      c: new THREE.Color().copy(cRim).multiplyScalar(0.20 + 0.18 * h) });
  }

  const pts = makePoints(world, P, { size: 0.045, opacity: 0.9 });
  const sw = new Swimmer({ start: [-0.8, 0, 0], turnK: 0.35, avMax: 0.35, bound: 6.5, vMax: 0.28, rollK: 0.3, rollMax: 0.2, drag: 0.6 });

  const p = paramDefaults(LEAFY_SEADRAGON_PARAMS);
  // internal sway clock — all idle motion (rock/bob/leaf sway/fin flutter)
  // runs on this instead of raw `time`, so «Sway rate» is honest
  let animT = 0;
  return {
    cloud: pts,
    head: sw.head,
    p,
    update(cursor, dt, _time) {
      sw.kSpeed = p.speed; sw.kTurn = p.turn;
      sw.steer(cursor, dt);
      const want = Math.min(1, sw.dist / 1.0);
      sw.move((0.30 * want + 0.05 + (sw.dist < 0.9 && sw.dist > 0.15 ? 0.18 : 0)) * Math.min(1, Math.max(0.35, sw.dist / 1.2)), dt);
      animT += dt * p.sway;
      const rock = Math.sin(animT * 0.55) * 0.10 + Math.sin(animT * 0.23) * 0.05;
      const cr = Math.cos(rock), sr = Math.sin(rock);
      const bob = Math.sin(animT * 0.62) * 0.035;
      const tailB = Math.sin(animT * 0.45 + 1);
      const nod = Math.sin(animT * 0.9) * 0.05;
      const flut = animT * 9;
      const kL = p.bodyLen, kW = p.bodyWide, kT = p.bodyThick; // «Proportions» (loop `p` is the particle)
      const pos = pts.pos;
      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        let lx = p.lx0 as number, ly = p.ly0 as number, lz = p.lz0 as number;
        const bt = (p.bt as number) ?? 0.3;
        if (p.kind === 'l') {
          const sway = Math.sin(animT * 0.9 + (p.li as number) * 1.7) * 0.018 * (p.s as number);
          ly += (p.pdy as number) * sway; lz += (p.pdz as number) * sway;
        } else if (p.kind === 'p') lx += Math.sin(flut + (p.s as number) * 3) * 0.02 * (0.4 + (p.s as number));
        else if (p.kind === 'd') lx += Math.sin(flut * 1.1 + (p.s as number) * 5) * 0.018 * (0.3 + (p.h as number));
        lx += Math.sin(animT * 0.7 + bt * 2.4) * 0.045 * (0.15 + bt);
        if (bt < 0.16) {
          const k = (0.16 - bt) / 0.16, cn = Math.cos(nod * k), sn = Math.sin(nod * k);
          const dy = ly - 0.30, dz = lz - 0.34;
          ly = 0.30 + dy * cn - dz * sn; lz = 0.34 + dy * sn + dz * cn;
        }
        if (bt > 0.55) {
          const k = (bt - 0.55) / 0.45, ta = tailB * 0.10 * k, ct = Math.cos(ta), st2 = Math.sin(ta);
          const dy = ly - 0.10, dz = lz + 0.26;
          ly = 0.10 + dy * ct - dz * st2; lz = -0.26 + dy * st2 + dz * ct;
        }
        lz += bob;
        const ry = ly * cr - lz * sr, rz = ly * sr + lz * cr;
        // «Proportions»: applied after the rock rotation so the whole silhouette
        // (body + leaves) stretches coherently
        place(pos, i, sw.head, sw.dir, sw.sideR, sw.upR, lx * kW, ry * kL, rz * kT);
      }
      pts.geo.attributes.position.needsUpdate = true;
    },
    dispose() { world.scene.remove(pts.points); pts.geo.dispose(); pts.mat.dispose(); },
  };
}
