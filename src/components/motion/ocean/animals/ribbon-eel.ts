/*!
 * particle-ocean · https://github.com/ekazanec/particle-ocean
 * Copyright (c) 2026 Andrey Gurov · https://agurov.com
 * MIT licensed. If you ship something built on this, a link back is appreciated.
 */
/** Ribbon eel — huge-amplitude curvature wave, yellow dorsal crest. Port of ribbon-eel.html. */
import * as THREE from 'three';
import { makePoints, type Particle, type WorldCtx } from '@/components/motion/ocean/core';
import { APPEARANCE, mul, paramDefaults, PROPORTIONS, rhythm, SPEED, TURN } from '@/components/motion/ocean/params';
import type { OceanAnimal, OceanParamDef } from '@/components/motion/ocean/types';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

export const RIBBON_EEL_PARAMS: OceanParamDef[] = [
  SPEED, TURN,
  rhythm('Wave rate', 'Rate of the ribbon wave travelling down the body'),
  mul('waveAmp', 'Undulation amplitude', 'How strongly the ribbon bends', 0.3, 2),
  ...PROPORTIONS, ...APPEARANCE,
];

export function makeRibbonEel(world: WorldCtx): OceanAnimal {
  const cBlue = new THREE.Color(0x2b5cf0), cDeepB = new THREE.Color(0x11288a);
  const cYellow = new THREE.Color(0xf0d43c), cPale = new THREE.Color(0xbfe4f5);

  const SPINE = 84, SEG = 0.030;
  const rspine: THREE.Vector3[] = [], hdirs: THREE.Vector3[] = [];
  for (let i = 0; i < SPINE; i++) { rspine.push(new THREE.Vector3(-1 - i * SEG, 0, 0)); hdirs.push(new THREE.Vector3(1, 0, 0)); }
  const headP = new THREE.Vector3(-1, 0, 0);
  const dir = new THREE.Vector3(1, 0, 0), dirVel = new THREE.Vector3();

  const bodyR = (u: number) => 0.030 * (1 - 0.55 * Math.pow(Math.max(0, (u - 0.55) / 0.45), 1.3)) * (u < 0.06 ? 0.7 + 5 * u : 1) + 0.004;

  const P: Particle[] = [];
  for (let i = 0; i < 2600; i++) {
    const u = Math.random(), a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random());
    const R = bodyR(u);
    const c = new THREE.Color();
    if (Math.sin(a) < -0.6) c.copy(cYellow).multiplyScalar(0.25);
    else c.copy(cBlue).lerp(cDeepB, Math.random() * 0.6).multiplyScalar(0.5);
    c.multiplyScalar(0.8 + Math.random() * 0.4);
    P.push({ kind: 'b', u, lx0: Math.cos(a) * rr * R * 0.45, lz0: Math.sin(a) * rr * R * 2.2, c });
  }
  for (let i = 0; i < 900; i++) {
    const u = Math.random(), h = Math.random();
    P.push({ kind: 'f', u, h, c: new THREE.Color().copy(cYellow).lerp(cPale, h * 0.3).multiplyScalar((0.35 + Math.random() * 0.25) * (1 - 0.25 * u)) });
  }
  for (let i = 0; i < 260; i++) {
    const t = Math.random(), a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random());
    const rad = 0.035 * (1 - 0.4 * t);
    P.push({ kind: 'h', hx: Math.cos(a) * rr * rad * 0.6, hy: t * 0.16, hz: Math.sin(a) * rr * rad * 1.4,
      c: new THREE.Color().copy(cYellow).multiplyScalar(0.4 + Math.random() * 0.25) });
  }
  for (const sgn of [-1, 1]) for (let i = 0; i < 40; i++) {
    const d = Math.random();
    P.push({ kind: 'h', hx: sgn * (0.02 + d * 0.025), hy: 0.15 + d * 0.03, hz: 0.02 + d * 0.045,
      c: new THREE.Color().copy(cYellow).lerp(cPale, 0.4).multiplyScalar(0.5 + 0.3 * d) });
  }
  for (let i = 0; i < 70; i++) {
    const t = Math.random();
    P.push({ kind: 'h', jw: t, hx: (Math.random() - 0.5) * 0.03 * (1 - 0.4 * t), hy: 0.02 + t * 0.13, hz: -0.02 - Math.random() * 0.012,
      c: new THREE.Color().copy(cYellow).multiplyScalar(0.35 + Math.random() * 0.2) });
  }
  for (const sgn of [-1, 1]) for (let i = 0; i < 10; i++) {
    P.push({ kind: 'h', hx: sgn * 0.025, hy: 0.09, hz: 0.02, c: new THREE.Color(0xffffff).multiplyScalar(0.6) });
  }

  const pts = makePoints(world, P, { size: 0.055 });
  const posA = pts.pos;

  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const fwdS = new THREE.Vector3(), sideS = new THREE.Vector3(), upS = new THREE.Vector3();
  let speed = 0.4, wavePh = 0, strikeT = -10, armed = true;
  const bp = paramDefaults(RIBBON_EEL_PARAMS);

  return {
    cloud: pts,
    head: headP,
    p: bp,
    update(cursor, dt, time) {
      tmp2.copy(cursor).sub(headP);
      const dist = tmp2.length();
      if (dist > 0.001) tmp2.normalize();
      const behind_tmp2 = tmp2.dot(dir);
      if (behind_tmp2 < -0.35 && dist > 0.001) {
        const px = -dir.z, pz = dir.x;
        const sgn = tmp2.x * px + tmp2.z * pz >= 0 ? 1 : -1;
        const w = (-behind_tmp2 - 0.35) * 1.8;
        tmp2.x += px * sgn * w; tmp2.z += pz * sgn * w;
        tmp2.normalize();
      }
      tmp.copy(tmp2).sub(dir);
      dirVel.addScaledVector(tmp, 1.0 * bp.turn * Math.min(1, dist / 1.2) * dt);
      dirVel.multiplyScalar(Math.pow(0.25, dt));
      const av = dirVel.length();
      const avCap = 1.2 * bp.turn;
      if (av > avCap) dirVel.multiplyScalar(avCap / av);
      dir.addScaledVector(dirVel, dt).normalize();
      if (Math.abs(dir.y) > 0.55) { dir.y = Math.sign(dir.y) * 0.55; dir.normalize(); }
      const off = headP.length();
      if (off > 6.5) { tmp.copy(headP).multiplyScalar(-1 / off); dir.lerp(tmp, (off - 6.5) * 1.4 * dt).normalize(); }

      if (dist > 1.7) armed = true;
      if (armed && dist < 1.1 && tmp2.dot(dir) > 0.75) { strikeT = time; armed = false; }
      const strike = Math.max(0, 1 - (time - strikeT) / 0.5);
      const slowR = Math.min(1, Math.max(0.3, dist / 1.6));
      const ts = ((0.30 + 0.6 * Math.min(1, dist / 2)) * slowR + 1.4 * strike) * bp.speed;
      speed += (ts - speed) * (1 - Math.pow(0.3, dt));
      wavePh += (1.0 + speed * 0.9) * bp.rhythm * dt;
      headP.addScaledVector(dir, speed * dt);

      // curvature wave — the ribbon coils hard
      hdirs[0].copy(dir);
      const prop = Math.min(1, (0.3 + speed) * dt / SEG * 0.5);
      for (let k = 1; k < SPINE; k++) hdirs[k].lerp(hdirs[k - 1], prop).normalize();
      rspine[0].copy(headP);
      // «Proportions»: kL stretches the spine, kW/kT scale the ribbon section
      const kL = bp.bodyLen, kW = bp.bodyWide, kT = bp.bodyThick;
      const wScale = (0.5 + 0.5 * Math.min(1, speed)) * bp.waveAmp;
      for (let k = 1; k < SPINE; k++) {
        const uu = k / (SPINE - 1);
        const A = (0.35 + 2.6 * Math.pow(uu, 1.2)) * wScale;
        const th = Math.sin(wavePh * Math.PI * 2 - uu * 12.5) * A;
        const h = hdirs[k];
        const ct = Math.cos(th), st = Math.sin(th);
        tmp.set(h.x * ct + h.z * st, h.y, -h.x * st + h.z * ct);
        rspine[k].copy(rspine[k - 1]).addScaledVector(tmp, -SEG * kL);
      }

      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        if (p.kind === 'h') {
          fwdS.copy(rspine[0]).sub(rspine[3]).normalize();
          sideS.crossVectors(WORLD_UP, fwdS);
          if (sideS.lengthSq() < 1e-4) sideS.set(0, 0, 1); else sideS.normalize();
          upS.crossVectors(fwdS, sideS).normalize();
          const strike2 = Math.max(0, 1 - (time - strikeT) / 0.5);
          const hz2 = ((p.hz as number) - (p.jw !== undefined ? strike2 * 0.10 * (p.jw as number) : 0)) * kT;
          const hx = (p.hx as number) * kW, hy = (p.hy as number) * kL;
          posA[i * 3] = rspine[0].x + fwdS.x * hy + sideS.x * hx + upS.x * hz2;
          posA[i * 3 + 1] = rspine[0].y + fwdS.y * hy + sideS.y * hx + upS.y * hz2;
          posA[i * 3 + 2] = rspine[0].z + fwdS.z * hy + sideS.z * hx + upS.z * hz2;
          continue;
        }
        const u = p.u as number;
        const fi = u * (SPINE - 2);
        const i0 = Math.floor(fi), f = fi - i0;
        tmp.copy(rspine[i0]).lerp(rspine[i0 + 1], f);
        fwdS.copy(rspine[Math.max(0, i0 - 1)]).sub(rspine[Math.min(SPINE - 1, i0 + 2)]).normalize();
        sideS.crossVectors(WORLD_UP, fwdS);
        if (sideS.lengthSq() < 1e-4) sideS.set(0, 0, 1); else sideS.normalize();
        upS.crossVectors(fwdS, sideS).normalize();
        let lx: number, lz: number;
        if (p.kind === 'b') { lx = p.lx0 as number; lz = p.lz0 as number; }
        else {
          const h = p.h as number;
          const R = bodyR(u) * 2.2;
          lz = R + h * (0.055 + 0.02 * Math.sin(u * 20 + time * 3));
          lx = Math.sin(wavePh * Math.PI * 2 - u * 12.5 - h * 1.1) * 0.02 * h;
        }
        lx *= kW; lz *= kT; // proportions: ribbon cross-section
        posA[i * 3] = tmp.x + sideS.x * lx + upS.x * lz;
        posA[i * 3 + 1] = tmp.y + sideS.y * lx + upS.y * lz;
        posA[i * 3 + 2] = tmp.z + sideS.z * lx + upS.z * lz;
      }
      pts.geo.attributes.position.needsUpdate = true;
    },
    dispose() { world.scene.remove(pts.points); pts.geo.dispose(); pts.mat.dispose(); },
  };
}
