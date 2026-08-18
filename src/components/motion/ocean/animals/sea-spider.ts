/*!
 * particle-ocean · https://github.com/ekazanec/particle-ocean
 * Copyright (c) 2026 Andrey Gurov · https://agurov.com
 * MIT licensed. If you ship something built on this, a link back is appreciated.
 */
/** Sea spider — metachronal rowing legs with per-frame joints. Port of sea-spider.html. */
import * as THREE from 'three';
import { BasisSmoother, makePoints, type Particle, type WorldCtx } from '@/components/motion/ocean/core';
import { APPEARANCE, mul, paramDefaults, PROPORTIONS, rhythm, SPEED, TURN } from '@/components/motion/ocean/params';
import type { OceanAnimal, OceanParamDef } from '@/components/motion/ocean/types';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

export const SEA_SPIDER_PARAMS: OceanParamDef[] = [
  SPEED, TURN,
  rhythm('Rowing rate', 'Rate of the metachronal leg rowing'),
  mul('stride', 'Rowing reach', 'How wide the legs circle', 0.3, 2),
  ...PROPORTIONS, ...APPEARANCE,
];

export function makeSeaSpider(world: WorldCtx): OceanAnimal {
  const cBody = new THREE.Color(0xc65a2e), cDark = new THREE.Color(0x6e2a14);
  const cJoint = new THREE.Color(0xf0c090), cGlow = new THREE.Color(0xffd9a0);

  const LEGS = 8, SEGS = 3;
  interface LegDef { sgn: number; q: number; az: number; phOff: number; L: [number, number, number]; baseLy: number }
  const legDef: LegDef[] = [];
  for (let j = 0; j < LEGS; j++) {
    const sgn = j < 4 ? -1 : 1;
    const q = j % 4;
    legDef.push({
      sgn, q, az: 0.55 - q * 0.38,
      phOff: q * 0.85 + (sgn > 0 ? 0.45 : 0),
      L: [0.26, 0.52 + 0.05 * Math.sin(q), 0.58 - 0.04 * q],
      baseLy: 0.16 - q * 0.115,
    });
  }
  const legJoints = legDef.map(() => [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);

  const P: Particle[] = [];
  for (let i = 0; i < 520; i++) {
    const u = Math.random();
    const seg = Math.floor(u * 4) / 4;
    const bead = Math.sin((u - seg) * 4 * Math.PI);
    const a = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.random());
    const rad = 0.045 + 0.02 * bead;
    P.push({ kind: 'body', lx: Math.cos(a) * rr * rad, ly: 0.2 - u * 0.5, lz0: Math.sin(a) * rr * rad,
      c: new THREE.Color().copy(cBody).lerp(cDark, Math.random() * 0.6).multiplyScalar(0.5 + Math.random() * 0.3) });
  }
  for (let i = 0; i < 160; i++) {
    const d = Math.random();
    const a = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.random());
    const rad = 0.035 * (1 - 0.5 * d);
    P.push({ kind: 'body', lx: Math.cos(a) * rr * rad, ly: 0.2 + d * 0.3, lz0: Math.sin(a) * rr * rad * 0.8 - 0.02 * d,
      c: new THREE.Color().copy(cJoint).multiplyScalar((0.35 + Math.random() * 0.2) * (1 - 0.3 * d)) });
  }
  for (let i = 0; i < 40; i++) {
    P.push({ kind: 'body', lx: (Math.random() - 0.5) * 0.03, ly: 0.13 + (Math.random() - 0.5) * 0.03, lz0: 0.06 + Math.random() * 0.025,
      c: new THREE.Color(0xffffff).multiplyScalar(0.4 + Math.random() * 0.35) });
  }
  for (let i = 0; i < 60; i++) {
    const d = Math.random();
    P.push({ kind: 'body', lx: (Math.random() - 0.5) * 0.04, ly: -0.32 - d * 0.1, lz0: 0.01 + (Math.random() - 0.5) * 0.03,
      c: new THREE.Color().copy(cDark).multiplyScalar(0.45 * (1 - 0.4 * d)) });
  }
  for (let j = 0; j < LEGS; j++) {
    for (let s = 0; s < SEGS; s++) {
      const PK = [26, 46, 50][s];
      for (let k = 0; k < PK; k++) {
        const f = (k + Math.random()) / PK;
        const c = new THREE.Color();
        if (f > 0.9 || f < 0.08) c.copy(cJoint).multiplyScalar(0.5 + Math.random() * 0.3);
        else c.copy(cBody).lerp(cDark, Math.random() * 0.5).multiplyScalar(0.4 + Math.random() * 0.25);
        if (s === 2 && f > 0.92) c.copy(cGlow).multiplyScalar(0.6);
        const w = [0.02, 0.016, 0.011][s];
        P.push({ kind: 'leg', j, s, f, jx: (Math.random() - 0.5) * w, jy: (Math.random() - 0.5) * w, jz: (Math.random() - 0.5) * w, c });
      }
    }
  }

  const pts = makePoints(world, P, { size: 0.06 });
  const pos = pts.pos;

  const head = new THREE.Vector3(-1.2, 0, 0);
  const hVel = new THREE.Vector3(0.15, 0, 0);
  const fwd = new THREE.Vector3(1, 0, 0);
  const fwdVel = new THREE.Vector3();
  const basis = new BasisSmoother(fwd);
  let roll = 0, rollVel = 0;
  let rowPh = 0, prevRow = 0;

  const side = new THREE.Vector3(), up2 = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const sideR = new THREE.Vector3(), upR = new THREE.Vector3();
  const bp = paramDefaults(SEA_SPIDER_PARAMS);

  return {
    cloud: pts,
    head,
    p: bp,
    update(cursor, dt, time) {
      tmp2.copy(cursor).sub(head);
      const dist = tmp2.length();
      if (dist > 0.001) tmp2.normalize();

      const behind_tmp2 = tmp2.dot(fwd);
      if (behind_tmp2 < -0.35 && dist > 0.001) {
        const px = -fwd.z, pz = fwd.x;
        const sgn = tmp2.x * px + tmp2.z * pz >= 0 ? 1 : -1;
        const w = (-behind_tmp2 - 0.35) * 1.8;
        tmp2.x += px * sgn * w; tmp2.z += pz * sgn * w;
        tmp2.normalize();
      }
      const want = Math.min(1, dist / 1.5);
      tmp.copy(tmp2).sub(fwd);
      fwdVel.addScaledVector(tmp, 0.6 * bp.turn * want * dt);
      fwdVel.multiplyScalar(Math.pow(0.3, dt));
      const av = fwdVel.length();
      const avCap = 0.7 * bp.turn;
      if (av > avCap) fwdVel.multiplyScalar(avCap / av);
      fwd.addScaledVector(fwdVel, dt).normalize();
      if (Math.abs(fwd.y) > 0.55) { fwd.y = Math.sign(fwd.y) * 0.55; fwd.normalize(); }

      side.copy(basis.update(fwd, dt));
      up2.crossVectors(fwd, side).normalize();

      const turn = fwdVel.dot(side);
      const rollTarget = THREE.MathUtils.clamp(-turn * 0.7, -0.35, 0.35);
      rollVel += (rollTarget - roll) * 3 * dt; rollVel *= Math.pow(0.15, dt);
      roll += rollVel * dt * 3;
      const cr = Math.cos(roll), sr = Math.sin(roll);
      sideR.copy(side).multiplyScalar(cr).addScaledVector(up2, sr);
      upR.copy(up2).multiplyScalar(cr).addScaledVector(side, -sr);

      const rowF = (0.5 + 0.25 * Math.min(1, dist / 2.5)) * bp.rhythm;
      rowPh += rowF * dt;
      const row = Math.sin(rowPh * Math.PI * 2);
      const rowV = (row - prevRow) / Math.max(dt, 1e-4); prevRow = row;
      const thrust = (Math.max(0, -rowV) * 0.08 + 0.06) * bp.speed;

      hVel.addScaledVector(fwd, thrust * dt * 2);
      hVel.y += Math.sin(time * 0.7) * 0.006 * dt;
      hVel.multiplyScalar(Math.pow(0.45, dt));
      const off = head.length();
      if (off > 6.5) hVel.addScaledVector(tmp.copy(head).multiplyScalar(-1 / off), (off - 6.5) * 2.0 * dt);
      const sp = hVel.length();
      const spCap = 1.0 * bp.speed;
      if (sp > spCap) hVel.multiplyScalar(spCap / sp);
      if (!Number.isFinite(head.x + hVel.x + fwd.x)) { head.set(0, 0, 0); hVel.set(0.15, 0, 0); fwd.set(1, 0, 0); fwdVel.set(0, 0, 0); }
      head.addScaledVector(hVel, dt);

      const bodyBob = -row * 0.03;
      const kStride = bp.stride; // rowing stroke amplitude (joint swing)
      const kL = bp.bodyLen, kW = bp.bodyWide, kT = bp.bodyThick; // «Proportions»

      for (let j = 0; j < LEGS; j++) {
        const d = legDef[j];
        const sw = Math.sin((rowPh - d.phOff * 0.16) * Math.PI * 2);
        const swK = Math.sin((rowPh - d.phOff * 0.16) * Math.PI * 2 - 0.7);
        const e1 = 0.55 + 0.30 * sw * kStride;
        const e2 = 0.05 + 0.55 * swK * kStride;
        const e3 = -1.05 + 0.50 * Math.sin((rowPh - d.phOff * 0.16) * Math.PI * 2 - 1.3) * kStride;
        const azz = d.az + sw * 0.12 * d.sgn * kStride;
        const hx = d.sgn * Math.cos(azz), hy = Math.sin(azz);
        const J = legJoints[j];
        J[0].set(d.sgn * 0.05, d.baseLy, 0.015 + bodyBob * 0.3);
        let px = J[0].x, py = J[0].y, pz = J[0].z;
        const es = [e1, e2, e3];
        for (let s = 0; s < SEGS; s++) {
          const ce = Math.cos(es[s]), se = Math.sin(es[s]);
          px += hx * ce * d.L[s]; py += hy * ce * d.L[s]; pz += se * d.L[s];
          J[s + 1].set(px, py, pz);
        }
      }

      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        let lx: number, ly: number, lz: number;
        if (p.kind === 'body') {
          lx = p.lx as number; ly = p.ly as number; lz = (p.lz0 as number) + bodyBob;
        } else {
          const J = legJoints[p.j as number];
          const a = J[p.s as number], b = J[(p.s as number) + 1];
          const f = p.f as number;
          lx = a.x + (b.x - a.x) * f + (p.jx as number);
          ly = a.y + (b.y - a.y) * f + (p.jy as number);
          lz = a.z + (b.z - a.z) * f + (p.jz as number);
        }
        lx *= kW; ly *= kL; lz *= kT; // proportions: body + legs together
        pos[i * 3] = head.x + fwd.x * ly + sideR.x * lx + upR.x * lz;
        pos[i * 3 + 1] = head.y + fwd.y * ly + sideR.y * lx + upR.y * lz;
        pos[i * 3 + 2] = head.z + fwd.z * ly + sideR.z * lx + upR.z * lz;
      }
      pts.geo.attributes.position.needsUpdate = true;
    },
    dispose() { world.scene.remove(pts.points); pts.geo.dispose(); pts.mat.dispose(); },
  };
}
