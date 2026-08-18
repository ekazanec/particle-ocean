/** Lionfish — banded venomous rays, hovering drift. Port of lionfish.html. */
import * as THREE from 'three';
import { BasisSmoother, makePoints, type Particle, type WorldCtx } from '@/components/motion/ocean/core';
import { APPEARANCE, mul, paramDefaults, PROPORTIONS, rhythm, SPEED, TURN } from '@/components/motion/ocean/params';
import type { OceanAnimal, OceanParamDef } from '@/components/motion/ocean/types';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

export const LIONFISH_PARAMS: OceanParamDef[] = [
  SPEED, TURN,
  rhythm('Fin rate', 'Rate of the pectoral fin fanning'),
  mul('finSpread', 'Fin reach', 'How wide the venomous rays spread', 0.4, 2),
  ...PROPORTIONS, ...APPEARANCE,
];

export function makeLionfish(world: WorldCtx): OceanAnimal {
  const cRed = new THREE.Color(0xd0452e), cMaroon = new THREE.Color(0x5e1a14);
  const cCream = new THREE.Color(0xf2e3c8);
  function bandColor(t: number, dim: number): THREE.Color {
    const c = new THREE.Color();
    const b = Math.sin(t * Math.PI * 2);
    if (b > 0.15) c.copy(cRed).lerp(cMaroon, Math.random() * 0.4);
    else if (b < -0.15) c.copy(cCream);
    else c.copy(cMaroon);
    return c.multiplyScalar(dim * (0.75 + Math.random() * 0.25));
  }

  const P: Particle[] = [];
  const BODY_N = 2600;
  for (let i = 0; i < BODY_N; i++) {
    const u = Math.random();
    const a = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.random());
    const prof = Math.sin(Math.PI * Math.pow(u, 0.8));
    const H = 0.30 * prof + 0.03, W = 0.11 * prof + 0.015;
    const lz = Math.sin(a) * rr * H + 0.02 * Math.sin(u * 7);
    P.push({ kind: 'body', lx: Math.cos(a) * rr * W, ly: (u - 0.45) * 1.05, lz0: lz, u, c: bandColor(u * 4.2 + lz * 1.8, 0.55) });
  }
  for (const sgn of [-1, 1]) for (let i = 0; i < 22; i++) {
    P.push({ kind: 'body', lx: sgn * 0.075, ly: 0.42 + (Math.random() - 0.5) * 0.02, lz0: 0.06 + (Math.random() - 0.5) * 0.02, u: 0.9,
      c: new THREE.Color(0xffffff).multiplyScalar(0.5 + Math.random() * 0.4) });
  }
  for (const sgn of [-1, 1]) for (let i = 0; i < 26; i++) {
    const d = Math.random();
    P.push({ kind: 'spine', base: [sgn * 0.07, 0.42, 0.1], dir: [sgn * 0.25, 0.25, 1], len: 0.22, d, ph: 0.5 + sgn * 0.2, c: bandColor(d * 2, 0.5) });
  }
  const DORS = 12;
  for (let s = 0; s < DORS; s++) {
    const q = s / (DORS - 1);
    const ly0 = 0.38 - q * 0.78;
    const prof = Math.sin(Math.PI * Math.pow(0.45 + q * 0.4, 0.8));
    const lz0 = 0.30 * prof;
    const len = 0.55 + 0.35 * Math.sin(Math.PI * (0.25 + q * 0.6)) + (s % 2) * 0.06;
    const tilt = -0.25 - q * 0.75;
    const dir: [number, number, number] = [(Math.random() - 0.5) * 0.12, Math.sin(tilt), Math.cos(tilt)];
    const PK = 26;
    for (let k = 0; k < PK; k++) {
      const d = (k + Math.random()) / PK;
      P.push({ kind: 'spine', base: [0, ly0, lz0], dir, len, d, ph: q * 1.6, c: bandColor(d * 3 + s * 0.35, 0.7 * (1 - 0.45 * d)) });
    }
  }
  const PECT = 11;
  for (const sgn of [-1, 1]) for (let s = 0; s < PECT; s++) {
    const q = s / (PECT - 1);
    const ang = -0.15 - q * 1.5;
    const dir: [number, number, number] = [sgn * Math.cos(ang * 0.5) * 0.95, Math.sin(ang) * 0.55 - 0.1, -0.25 - 0.5 * q];
    const len = 0.85 + 0.25 * Math.sin(Math.PI * q) - 0.1 * q;
    const PK = 30;
    for (let k = 0; k < PK; k++) {
      const d = (k + Math.random()) / PK;
      P.push({ kind: 'spine', base: [sgn * 0.08, 0.16, -0.02], dir, len, d, ph: q * 1.8 + (sgn > 0 ? 0 : 0.9), c: bandColor(d * 3.4 + s * 0.5, 0.65 * (1 - 0.5 * d)) });
    }
  }
  for (const sgn of [-1, 1]) for (let s = 0; s < 4; s++) {
    const q = s / 3;
    const dir: [number, number, number] = [sgn * 0.3, -0.2 - q * 0.3, -0.9];
    const PK = 16;
    for (let k = 0; k < PK; k++) {
      const d = (k + Math.random()) / PK;
      P.push({ kind: 'spine', base: [sgn * 0.05, 0.0, -0.24], dir, len: 0.4 + q * 0.1, d, ph: 1.1 + q, c: bandColor(d * 2.4 + q, 0.55 * (1 - 0.4 * d)) });
    }
  }
  const TAILR = 9;
  for (let s = 0; s < TAILR; s++) {
    const q = s / (TAILR - 1);
    const ang = (q - 0.5) * 1.15;
    const dir: [number, number, number] = [(Math.random() - 0.5) * 0.06, -Math.cos(ang), Math.sin(ang)];
    const PK = 22;
    for (let k = 0; k < PK; k++) {
      const d = (k + Math.random()) / PK;
      P.push({ kind: 'tailray', base: [0, -0.46, 0.01], dir, len: 0.42 + 0.1 * Math.sin(Math.PI * q), d, ph: q * 1.2, c: bandColor(d * 2.6 + q * 0.8, 0.6 * (1 - 0.45 * d)) });
    }
  }

  const pts = makePoints(world, P, { size: 0.065 });
  const pos = pts.pos;

  const head = new THREE.Vector3(-1.2, 0, 0);
  const hVel = new THREE.Vector3(0.2, 0, 0);
  const fwd = new THREE.Vector3(1, 0, 0);
  const fwdVel = new THREE.Vector3();
  const basis = new BasisSmoother(fwd);
  let roll = 0, rollVel = 0;
  let finPh = 0;

  const side = new THREE.Vector3(), up2 = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const sideR = new THREE.Vector3(), upR = new THREE.Vector3();
  const bp = paramDefaults(LIONFISH_PARAMS);

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
      const want = Math.min(1, dist / 1.2);
      tmp.copy(tmp2).sub(fwd);
      fwdVel.addScaledVector(tmp, 0.7 * bp.turn * want * dt);
      fwdVel.multiplyScalar(Math.pow(0.3, dt));
      const av = fwdVel.length();
      const avCap = 0.9 * bp.turn;
      if (av > avCap) fwdVel.multiplyScalar(avCap / av);
      fwd.addScaledVector(fwdVel, dt).normalize();
      if (Math.abs(fwd.y) > 0.60) { fwd.y = Math.sign(fwd.y) * 0.60; fwd.normalize(); }

      side.copy(basis.update(fwd, dt));
      up2.crossVectors(fwd, side).normalize();

      const turn = fwdVel.dot(side);
      const rollTarget = THREE.MathUtils.clamp(-turn * 0.9, -0.5, 0.5);
      rollVel += (rollTarget - roll) * 3 * dt; rollVel *= Math.pow(0.15, dt);
      roll += rollVel * dt * 3;
      const cr = Math.cos(roll), sr = Math.sin(roll);
      sideR.copy(side).multiplyScalar(cr).addScaledVector(up2, sr);
      upR.copy(up2).multiplyScalar(cr).addScaledVector(side, -sr);

      const finF = (1.1 + 0.5 * Math.min(1, dist / 2.5)) * bp.rhythm;
      finPh += finF * dt;
      const scull = 0.5 + 0.5 * Math.sin(finPh * Math.PI * 2);
      const cruise = (0.10 + 0.30 * Math.min(1, dist / 2)) * (0.6 + 0.4 * scull) * bp.speed;

      hVel.addScaledVector(fwd, cruise * dt * 2);
      hVel.y += Math.sin(time * 0.8) * 0.015 * dt * 0.6;
      hVel.multiplyScalar(Math.pow(0.4, dt));
      const off = head.length();
      if (off > 6.5) hVel.addScaledVector(tmp.copy(head).multiplyScalar(-1 / off), (off - 6.5) * 2.0 * dt);
      const sp = hVel.length();
      const spCap = 1.2 * bp.speed;
      if (sp > spCap) hVel.multiplyScalar(spCap / sp);
      if (!Number.isFinite(head.x + hVel.x + fwd.x)) { head.set(0, 0, 0); hVel.set(0.2, 0, 0); fwd.set(1, 0, 0); fwdVel.set(0, 0, 0); }
      head.addScaledVector(hVel, dt);

      const bendAmt = THREE.MathUtils.clamp(turn * 0.8, -0.35, 0.35);
      const kSpread = bp.finSpread; // ray length multiplier — fins fold/flare
      const kL = bp.bodyLen, kW = bp.bodyWide, kT = bp.bodyThick; // «Proportions»

      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        let lx: number, ly: number, lz: number;
        if (p.kind === 'body') {
          ly = p.ly as number;
          const u = p.u as number;
          const tailFrac = Math.max(0, 0.45 - u);
          lx = (p.lx as number) - bendAmt * tailFrac * tailFrac * 3.5 + Math.sin(time * 2.2 + u * 4) * 0.008 * (1 - u);
          lz = p.lz0 as number;
        } else {
          const L = (p.len as number) * kSpread, d = p.d as number, ph = p.ph as number;
          const base = p.base as [number, number, number], dirv = p.dir as [number, number, number];
          const swayA = (p.kind === 'tailray' ? 0.16 : 0.10) + 0.05 * Math.min(1, dist / 2);
          const sway = Math.sin(finPh * Math.PI * 2 * 0.9 - d * 2.2 + ph * Math.PI) * swayA * d * d;
          const sway2 = Math.sin(time * 0.9 + ph * 2.4) * 0.05 * d;
          const nl = Math.hypot(dirv[0], dirv[1], dirv[2]);
          lx = base[0] + dirv[0] / nl * L * d + sway + (p.kind === 'tailray' ? -bendAmt * 1.2 * d : 0);
          ly = base[1] + dirv[1] / nl * L * d + (p.kind === 'tailray' ? 0 : sway2 * 0.4);
          lz = base[2] + dirv[2] / nl * L * d + sway2;
        }
        lx *= kW; ly *= kL; lz *= kT; // proportions: body + rays together
        pos[i * 3] = head.x + fwd.x * ly + sideR.x * lx + upR.x * lz;
        pos[i * 3 + 1] = head.y + fwd.y * ly + sideR.y * lx + upR.y * lz;
        pos[i * 3 + 2] = head.z + fwd.z * ly + sideR.z * lx + upR.z * lz;
      }
      pts.geo.attributes.position.needsUpdate = true;
    },
    dispose() { world.scene.remove(pts.points); pts.geo.dispose(); pts.mat.dispose(); },
  };
}
