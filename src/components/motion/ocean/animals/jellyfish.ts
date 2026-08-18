/*!
 * particle-ocean · https://github.com/ekazanec/particle-ocean
 * Copyright (c) 2026 Andrey Gurov · https://agurov.com
 * MIT licensed. If you ship something built on this, a link back is appreciated.
 */
/** Jellyfish — asymmetric pulse, tentacle chains, ambush strike. Port of creature.html. */
import * as THREE from 'three';
import { makePoints, type Particle, type WorldCtx } from '@/components/motion/ocean/core';
import { APPEARANCE, mul, paramDefaults, PROPORTIONS, rhythm, SPEED, TURN } from '@/components/motion/ocean/params';
import type { OceanAnimal, OceanParamDef } from '@/components/motion/ocean/types';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

export const JELLYFISH_PARAMS: OceanParamDef[] = [
  SPEED, TURN,
  rhythm('Pulse rate', 'How often the bell contracts'),
  mul('pulseAmp', 'Pulse depth', 'How deeply the bell squeezes on each contraction', 0.3, 2),
  mul('tentSway', 'Tentacle sway', 'How actively the tentacles and oral arms stream', 0.3, 2.5),
  ...PROPORTIONS, ...APPEARANCE,
];

interface Chain {
  a: number;
  r0: number;
  pts: THREE.Vector3[];
  seg: number;
  kind: 'tent' | 'arm';
  phs: number;
  rf?: number;
  thick?: number;
}

export function makeJellyfish(world: WorldCtx): OceanAnimal {
  const P: Particle[] = [];
  // Lilac family (owner's call 2026-08-06): slide 1 used to share the deep
  // blue + cyan story with the devil ray — the jellyfish now carries its own
  // lilac/ultramarine palette, matched to its bg in registry.ts.
  const cBell = new THREE.Color(0xb9a4f5), cDeep = new THREE.Color(0x4b3ed6);
  const cRim = new THREE.Color(0xff7ab0), cGlow = new THREE.Color(0xe6dcff);

  const BELL_N = 2800;
  for (let i = 0; i < BELL_N; i++) {
    const t = Math.pow(Math.random(), 0.62);
    const a = Math.random() * Math.PI * 2;
    const c = new THREE.Color().copy(cBell).lerp(cDeep, Math.random() * 0.5);
    if (t > 0.88) c.lerp(cRim, (t - 0.88) / 0.12 * 0.85);
    c.multiplyScalar(0.35 + 0.5 * t + Math.random() * 0.15);
    P.push({ kind: 'bell', t, a, th: Math.random() * 0.07, ph: Math.random() * Math.PI * 2, c });
  }
  for (let i = 0; i < 500; i++) {
    const r = (0.12 + 0.88 * Math.pow(Math.random(), 0.7)) * 0.42;
    const th = Math.random() * Math.PI, a = Math.random() * Math.PI * 2;
    P.push({ kind: 'core', x: r * Math.sin(th) * Math.cos(a), y: -0.1 - Math.random() * 0.25, z: r * Math.sin(th) * Math.sin(a), ph: Math.random() * Math.PI * 2,
      c: new THREE.Color().copy(cGlow).multiplyScalar(0.12 + Math.random() * 0.18) });
  }

  const chains: Chain[] = [];
  function makeChain(a: number, r0: number, len: number, K: number, kind: 'tent' | 'arm'): number {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k < K; k++) pts.push(new THREE.Vector3(Math.cos(a) * r0, -k * len / K, Math.sin(a) * r0));
    chains.push({ a, r0, pts, seg: len / K, kind, phs: Math.random() * Math.PI * 2 });
    return chains.length - 1;
  }
  const TENT = 26, TENT_K = 22;
  for (let s = 0; s < TENT; s++) {
    const a = s / TENT * Math.PI * 2 + (Math.random() - 0.5) * 0.08;
    const rf = 0.72 + Math.random() * 0.16;
    const len = 1.9 + Math.random() * 1.5;
    const thick = 0.5 + Math.random() * 1.1;
    const ci = makeChain(a, rf, len, TENT_K, 'tent');
    chains[ci].rf = rf; chains[ci].thick = thick;
    const PK = 60;
    for (let k = 0; k < PK; k++) {
      const d = (k + Math.random()) / PK;
      const w = 0.05 * thick * (1 - 0.55 * d);
      P.push({ kind: 'chain', ci, d, jx: (Math.random() - 0.5) * w, jy: (Math.random() - 0.5) * w, jz: (Math.random() - 0.5) * w,
        c: new THREE.Color().copy(cBell).lerp(cGlow, 0.4).multiplyScalar((0.5 + Math.random() * 0.3) * (1 - 0.8 * d)) });
    }
  }
  const ARMS = 4;
  for (let s = 0; s < ARMS; s++) {
    const a = s / ARMS * Math.PI * 2 + 0.4;
    const ci = makeChain(a, 0.18, 1.6 + (s % 2) * 0.35, 14, 'arm');
    const PK = 180;
    for (let k = 0; k < PK; k++) {
      const d = (k + Math.random()) / PK;
      const spread = 0.11 * (1 - 0.4 * d);
      P.push({ kind: 'chain', ci, d, jx: (Math.random() - 0.5) * spread, jy: (Math.random() - 0.5) * 0.05, jz: (Math.random() - 0.5) * spread,
        c: new THREE.Color().copy(cGlow).lerp(cRim, 0.25).multiplyScalar((0.2 + Math.random() * 0.14) * (1 - 0.7 * d)) });
    }
  }

  const pts = makePoints(world, P, { size: 0.075, opacity: 0.75 });
  const pos = pts.pos;

  const head = new THREE.Vector3(0, 0, 0);
  const hVel = new THREE.Vector3(0, 0.2, 0);
  const dir = new THREE.Vector3(0, 1, 0);
  const dirVel = new THREE.Vector3();

  function pulseCurve(ph: number): number {
    ph = ((ph % 1) + 1) % 1;
    if (ph < 0.4) { const x = ph / 0.4; const s = x * x * (3 - 2 * x); return s * s * (3 - 2 * s); }
    const x = (ph - 0.4) / 0.6; return 1 - x * x * (3 - 2 * x);
  }

  const side = new THREE.Vector3(), up2 = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const anchor = new THREE.Vector3(), desired = new THREE.Vector3();
  let prevC = 0;
  let phase = 0;
  let strikeT = -10;
  let armed = true;
  const bp = paramDefaults(JELLYFISH_PARAMS);

  return {
    cloud: pts,
    head,
    p: bp,
    update(cursor, dt, time) {
      desired.copy(cursor).sub(head);
      const dist = desired.length();
      if (dist > 0.001) desired.normalize();
      const frenzy = Math.min(1, dist / 2.5);
      // anti-parallel stall guard (bell axis can be fully vertical, so use the
      // universal perpendicular — the target's off-axis component — as bias)
      const bhd = desired.dot(dir);
      if (bhd < -0.35 && dist > 0.001) {
        tmp.copy(desired).addScaledVector(dir, -bhd);
        if (tmp.lengthSq() < 1e-4) tmp.set(1, 0, 0).addScaledVector(dir, -dir.x);
        desired.addScaledVector(tmp.normalize(), (-bhd - 0.35) * 1.8).normalize();
      }
      if (dist > 0.15) {
        tmp2.copy(desired).sub(dir);
        dirVel.addScaledVector(tmp2, 1.0 * bp.turn * dt);
        dirVel.multiplyScalar(Math.pow(0.35, dt));
        const av = dirVel.length();
        const avCap = 1.4 * bp.turn;
        if (av > avCap) dirVel.multiplyScalar(avCap / av);
        dir.addScaledVector(dirVel, dt).normalize();
      }

      phase += (0.38 + 0.32 * frenzy) * bp.rhythm * dt;
      const c0 = pulseCurve(phase);
      const cVel = Math.max(0, (c0 - prevC) / Math.max(dt, 1e-4));
      prevC = c0;

      if (dist > 1.6) armed = true;
      if (armed && dist < 1.1 && time - strikeT > 1.4 && desired.dot(dir) > 0.85) {
        strikeT = time;
        armed = false;
        hVel.addScaledVector(desired, 1.7 * bp.speed);
      }
      const striking = time - strikeT < 0.35;

      hVel.addScaledVector(dir, cVel * (2.2 + 1.2 * frenzy) * bp.speed * dt);
      hVel.addScaledVector(desired, 0.35 * frenzy * bp.speed * dt);
      hVel.multiplyScalar(Math.pow(striking ? 0.5 : 0.3, dt));
      const off = head.length();
      if (off > 6.5) hVel.addScaledVector(tmp.copy(head).multiplyScalar(-1 / off), (off - 6.5) * 2.5 * dt);
      const sp = hVel.length();
      const spCap = 1.9 * bp.speed;
      if (sp > spCap) hVel.multiplyScalar(spCap / sp);
      if (!Number.isFinite(head.x + hVel.x + dir.x)) { head.set(0, 0, 0); hVel.set(0, 0, 0); dir.set(0, 1, 0); }
      head.addScaledVector(hVel, dt);

      side.crossVectors(dir, WORLD_UP);
      if (side.lengthSq() < 1e-4) side.set(1, 0, 0); else side.normalize();
      up2.crossVectors(side, dir).normalize();

      const R = 1.0;
      const ka = bp.pulseAmp; // pulse depth — scales every c0/cLoc deformation
      const hScale = 1 + 0.24 * c0 * ka;
      // «Proportions»: length along the bell axis (dir), width/thickness across
      const kL = bp.bodyLen, kW = bp.bodyWide, kT = bp.bodyThick;

      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        if (p.kind !== 'bell' && p.kind !== 'core') continue;
        let lx: number, ly: number, lz: number;
        if (p.kind === 'bell') {
          const t = p.t as number, a = p.a as number;
          const cLoc = pulseCurve(phase - t * 0.2);
          const pinch = 1 - 0.34 * ka * cLoc * (0.25 + 0.75 * t * t);
          const curl = 0.18 * ka * cLoc * t * t;
          const theta = t * 1.5;
          const rr = (R + (p.th as number)) * Math.sin(theta) * pinch;
          const yy = (R + (p.th as number)) * Math.cos(theta) * hScale - 0.55 - curl;
          const ripple = 0.022 * Math.sin(a * 6 + time * 1.4 + (p.ph as number)) * t;
          lx = (rr + ripple) * Math.cos(a);
          lz = (rr + ripple) * Math.sin(a);
          ly = yy;
        } else {
          lx = (p.x as number) * (1 - 0.2 * c0 * ka) + 0.02 * Math.sin(time * 1.3 + (p.ph as number));
          ly = (p.y as number) * hScale;
          lz = (p.z as number) * (1 - 0.2 * c0 * ka) + 0.02 * Math.cos(time * 1.1 + (p.ph as number));
        }
        lx *= kW; ly *= kL; lz *= kT; // proportions: bell + core together
        pos[i * 3] = head.x + dir.x * ly + side.x * lx + up2.x * lz;
        pos[i * 3 + 1] = head.y + dir.y * ly + side.y * lx + up2.y * lz;
        pos[i * 3 + 2] = head.z + dir.z * ly + side.z * lx + up2.z * lz;
      }

      const rimC = pulseCurve(phase - 0.2);
      const rimPinch = 1 - 0.34 * ka * rimC;
      for (let ci = 0; ci < chains.length; ci++) {
        const ch = chains[ci];
        const isArm = ch.kind === 'arm';
        const r0 = isArm ? ch.r0 : R * Math.sin(1.5) * rimPinch * (ch.rf ?? 1);
        const ay = (isArm ? -0.45 : R * Math.cos(1.5) * hScale - 0.62 - 0.12 * rimC) * kL;
        const lx0 = Math.cos(ch.a) * r0 * kW, lz0 = Math.sin(ch.a) * r0 * kT;
        anchor.set(
          head.x + dir.x * ay + side.x * lx0 + up2.x * lz0,
          head.y + dir.y * ay + side.y * lx0 + up2.y * lz0,
          head.z + dir.z * ay + side.z * lx0 + up2.z * lz0,
        );
        const cpts = ch.pts;
        cpts[0].copy(anchor);
        const swayF = (isArm ? 0.05 : 0.09) * bp.tentSway; // «Tentacle sway»
        for (let k = 1; k < cpts.length; k++) {
          const p0 = cpts[k - 1], p1 = cpts[k];
          const kk = k / (cpts.length - 1);
          p1.x += Math.sin(time * 1.1 + ch.phs + k * 0.55) * swayF * kk * dt;
          p1.z += Math.cos(time * 0.9 + ch.phs * 1.3 + k * 0.5) * swayF * kk * dt;
          p1.y -= (isArm ? 0.5 : 0.35) * kk * dt;
          tmp2.copy(p1).sub(p0);
          const d = tmp2.length();
          if (d > ch.seg && d > 1e-6) p1.copy(p0).addScaledVector(tmp2, ch.seg / d);
        }
      }

      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        if (p.kind !== 'chain') continue;
        const cpts = chains[p.ci as number].pts;
        const fu = (p.d as number) * (cpts.length - 1.001);
        const k0 = Math.floor(fu), f = fu - k0;
        tmp.copy(cpts[k0]).lerp(cpts[k0 + 1], f);
        pos[i * 3] = tmp.x + (p.jx as number);
        pos[i * 3 + 1] = tmp.y + (p.jy as number);
        pos[i * 3 + 2] = tmp.z + (p.jz as number);
      }
      pts.geo.attributes.position.needsUpdate = true;
    },
    dispose() { world.scene.remove(pts.points); pts.geo.dispose(); pts.mat.dispose(); },
  };
}
