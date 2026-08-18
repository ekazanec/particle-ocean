/*!
 * particle-ocean · https://github.com/ekazanec/particle-ocean
 * Copyright (c) 2026 Andrey Gurov · https://agurov.com
 * MIT licensed. If you ship something built on this, a link back is appreciated.
 */
/** Stingray — rounded disc, rajiform margin undulation, barbed whip tail. */
import * as THREE from 'three';
import { BasisSmoother, makePoints, type Particle, type WorldCtx } from '@/components/motion/ocean/core';
import { APPEARANCE, mul, paramDefaults, PROPORTIONS, rhythm, SPEED, TURN } from '@/components/motion/ocean/params';
import type { OceanAnimal, OceanParamDef } from '@/components/motion/ocean/types';

export const STINGRAY_PARAMS: OceanParamDef[] = [
  SPEED, TURN,
  rhythm('Wave rate', 'Rate of the wave travelling along the disc edges'),
  mul('waveAmp', 'Wave amplitude', 'How high the disc edges lift', 0.3, 2),
  mul('waveK', 'Waves across the disc', 'How many wave crests fit along the body'),
  ...PROPORTIONS, ...APPEARANCE,
];

export function makeStingray(world: WorldCtx): OceanAnimal {
  // Disc: near-circular pancake (width ≈ length), NO pointed rostrum; the
  // rear tapers as a wedge into the tail base instead of a blunt edge.
  // u ∈ [0,1.15] front→back along the body axis, w ∈ [-1,1] across.
  const LEN = 1.3;
  const halfWidth = (u: number) => u <= 0.94
    ? 0.64 * Math.sqrt(Math.max(0, 1 - Math.pow(u * 2 - 1, 2))) + 0.015
    : 0.319 * Math.max(0, 1 - (u - 0.94) / 0.21) + 0.012;

  const cTop = new THREE.Color(0x6b5c34), cTopD = new THREE.Color(0x3a3220);
  const cBelly = new THREE.Color(0xd8cfae), cEdge = new THREE.Color(0x8adfe8), cSpot = new THREE.Color(0x3fc8f0);

  const P: Particle[] = [];
  const BODY_N = 3600;
  for (let i = 0; i < BODY_N; i++) {
    const u = Math.random() * 1.15;
    const w = Math.random() * 2 - 1;
    const W = halfWidth(u);
    // volumetric head/body hump sinking into thin flexible margins;
    // mouth is VENTRAL — nothing modelled on the front edge
    const hump = 0.20 * Math.exp(-Math.pow(w * W / 0.26, 2)) * Math.sin(Math.PI * Math.pow(Math.min(u, 1), 0.75));
    const th = 0.028 * (1 - Math.abs(w) * 0.75) + 0.008;
    const v = Math.random() * 2 - 1;
    const lz = v * (th * 0.5 + hump * (v > 0 ? 0.60 : 0.28)) + hump * 0.10;
    const c = new THREE.Color();
    if (v > 0) c.copy(cTop).lerp(cTopD, Math.abs(w) * 0.5 + Math.random() * 0.3);
    else c.copy(cBelly).multiplyScalar(0.5);
    if (Math.abs(w) > 0.86) c.lerp(cEdge, (Math.abs(w) - 0.86) / 0.14 * 0.6);
    c.multiplyScalar(0.38 + Math.random() * 0.3);
    P.push({ kind: 'body', u, w, lz0: lz, c });
  }
  // blue spot pattern on the dorsal disc (blue-spotted ray)
  for (let i = 0; i < 340; i++) {
    const u = 0.08 + Math.random() * 0.8;
    const w = (Math.random() * 2 - 1) * 0.82;
    const W = halfWidth(u);
    const hump = 0.20 * Math.exp(-Math.pow(w * W / 0.26, 2)) * Math.sin(Math.PI * Math.pow(u, 0.75));
    P.push({ kind: 'body', u, w, lz0: 0.02 + hump * 0.72,
      c: new THREE.Color().copy(cSpot).multiplyScalar(0.5 + Math.random() * 0.45) });
  }
  // eyes + spiracles ON TOP of the head region (no frontal features)
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < 20; i++) {
      P.push({ kind: 'body', u: 0.16 + (Math.random() - 0.5) * 0.03, w: sgn * 0.17 + (Math.random() - 0.5) * 0.04,
        lz0: 0.155 + (Math.random() - 0.5) * 0.02,
        c: new THREE.Color(0xffffff).multiplyScalar(0.5 + Math.random() * 0.4) });
    }
    for (let i = 0; i < 12; i++) {
      P.push({ kind: 'body', u: 0.23 + (Math.random() - 0.5) * 0.03, w: sgn * 0.15 + (Math.random() - 0.5) * 0.04,
        lz0: 0.14 + (Math.random() - 0.5) * 0.015,
        c: new THREE.Color().copy(cTopD).multiplyScalar(0.9) });
    }
  }

  // physics tail chain: thick base → long thin whip (~1× disc length)
  const TAIL_K = 22, TAIL_LEN = 1.35;
  const tail: THREE.Vector3[] = [];
  for (let k = 0; k < TAIL_K; k++) tail.push(new THREE.Vector3(0, -0.80 - k * TAIL_LEN / TAIL_K, 0));
  const tailSeg = TAIL_LEN / TAIL_K;
  for (let i = 0; i < 330; i++) {
    const d = Math.pow(Math.random(), 0.75);
    const rad = 0.055 * Math.pow(1 - d, 1.4) + 0.006;
    P.push({ kind: 'tail', d, jx: (Math.random() - 0.5) * 2 * rad, jy: (Math.random() - 0.5) * 2 * rad, jz: (Math.random() - 0.5) * 2 * rad,
      c: new THREE.Color().copy(cTop).lerp(cEdge, 0.25 + d * 0.3).multiplyScalar((0.4 + Math.random() * 0.25) * (1 - 0.6 * d)) });
  }
  // venomous barb partway along the tail — short bright spike
  for (let i = 0; i < 40; i++) {
    const t = Math.random();
    P.push({ kind: 'tail', d: 0.30 + t * 0.08, jx: (Math.random() - 0.5) * 0.02, jy: 0, jz: 0.02 + t * 0.05,
      c: new THREE.Color(0xe8f4f8).multiplyScalar(0.45 + Math.random() * 0.35) });
  }

  const pts = makePoints(world, P, { size: 0.065, opacity: 0.8 });
  const pos = pts.pos;

  const head = new THREE.Vector3(-1.4, -0.3, 0);
  const hVel = new THREE.Vector3(0.3, 0, 0);
  const fwd = new THREE.Vector3(1, 0, 0);
  const fwdVel = new THREE.Vector3();
  const basis = new BasisSmoother(fwd);
  let roll = 0, rollVel = 0;
  let wavePh = Math.random();

  const side = new THREE.Vector3(), up2 = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const sideR = new THREE.Vector3(), upR = new THREE.Vector3();
  const prevDir = new THREE.Vector3();
  const bp = paramDefaults(STINGRAY_PARAMS);

  return {
    cloud: pts,
    head,
    p: bp,
    update(cursor, dt, time) {
      tmp2.copy(cursor).sub(head);
      const dist = tmp2.length();
      if (dist > 0.001) tmp2.normalize();

      const behind = tmp2.dot(fwd);
      if (behind < -0.35 && dist > 0.001) {
        const px = -fwd.z, pz = fwd.x;
        const sgn = tmp2.x * px + tmp2.z * pz >= 0 ? 1 : -1;
        const wgt = (-behind - 0.35) * 1.8;
        tmp2.x += px * sgn * wgt; tmp2.z += pz * sgn * wgt;
        tmp2.normalize();
      }
      const want = Math.min(1, dist / 1.6);
      tmp.copy(tmp2).sub(fwd);
      fwdVel.addScaledVector(tmp, 0.65 * bp.turn * want * dt);
      fwdVel.multiplyScalar(Math.pow(0.32, dt));
      const av = fwdVel.length();
      const avCap = 0.8 * bp.turn;
      if (av > avCap) fwdVel.multiplyScalar(avCap / av);
      fwd.addScaledVector(fwdVel, dt).normalize();
      // bottom-glider posture: shallow climbs/dives only
      if (Math.abs(fwd.y) > 0.42) { fwd.y = Math.sign(fwd.y) * 0.42; fwd.normalize(); }

      side.copy(basis.update(fwd, dt));
      up2.crossVectors(fwd, side).normalize();

      const turn = fwdVel.dot(side);
      const rollTarget = THREE.MathUtils.clamp(-turn * 1.1, -0.55, 0.55);
      rollVel += (rollTarget - roll) * 3 * dt; rollVel *= Math.pow(0.14, dt);
      roll += rollVel * dt * 3;
      const cr = Math.cos(roll), sr = Math.sin(roll);
      sideR.copy(side).multiplyScalar(cr).addScaledVector(up2, sr);
      upR.copy(up2).multiplyScalar(cr).addScaledVector(side, -sr);

      // rajiform undulation: traveling wave front→back along the disc margins;
      // near-steady thrust (no flap pulse), plus a slow glide-descent breath
      const waveF = (0.55 + 0.25 * Math.min(1, dist / 3)) * bp.rhythm;
      wavePh += waveF * dt;
      const glide = Math.sin(time * 0.21);
      const thrust = (0.26 + 0.05 * Math.min(1, dist / 2)) * bp.speed;
      const slowT = Math.min(1, Math.max(0.35, dist / 1.4));

      hVel.addScaledVector(fwd, thrust * slowT * dt * 2.2);
      hVel.y += (glide > 0 ? -0.010 : 0.004) * dt; // gentle settle, softer rise
      hVel.multiplyScalar(Math.pow(0.5, dt));
      hVel.multiplyScalar(Math.pow(0.25, dt * (1 - slowT) * 1.6)); // arrival brake
      const off = head.length();
      if (off > 6.5) hVel.addScaledVector(tmp.copy(head).multiplyScalar(-1 / off), (off - 6.5) * 2.0 * dt);
      const sp = hVel.length();
      const spCap = 1.6 * bp.speed;
      if (sp > spCap) hVel.multiplyScalar(spCap / sp);
      if (!Number.isFinite(head.x + hVel.x + fwd.x)) { head.set(0, 0, 0); hVel.set(0.3, 0, 0); fwd.set(1, 0, 0); fwdVel.set(0, 0, 0); }
      head.addScaledVector(hVel, dt);

      // slight nose-up glide pitch rides on the same slow cycle
      const pitch = 0.05 * glide;
      const kAmp = bp.waveAmp, kWav = bp.waveK; // margin-wave height / spatial frequency
      const kL = bp.bodyLen, kW = bp.bodyWide, kT = bp.bodyThick; // «Proportions» (width = disc span)

      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        if (p.kind === 'tail') continue;
        const u = p.u as number, w = p.w as number;
        const W = halfWidth(u);
        const lx = w * W * kW;
        let ly = (0.5 - u) * LEN;
        // margin wave: zero on the centreline, growing outward — the disc
        // edge ripples while the body core stays steady
        const edge = Math.pow(Math.abs(w), 1.7) * (W / 0.655);
        const wave = Math.sin((wavePh - u * 1.5 * kWav) * Math.PI * 2);
        let lz = (p.lz0 as number) + wave * edge * 0.20 * kAmp;
        lz += ly * pitch; // glide pitch
        ly += -wave * edge * 0.03 * kAmp; // faint chordwise shimmer
        ly *= kL; lz *= kT;
        pos[i * 3] = head.x + fwd.x * ly + sideR.x * lx + upR.x * lz;
        pos[i * 3 + 1] = head.y + fwd.y * ly + sideR.y * lx + upR.y * lz;
        pos[i * 3 + 2] = head.z + fwd.z * ly + sideR.z * lx + upR.z * lz;
      }

      // tail: anchored chain, stiff near the thick base; the root follows the
      // stretched disc (kL) so the whip never detaches from the wedge
      tmp.set(
        head.x + fwd.x * -0.80 * kL + upR.x * 0.02,
        head.y + fwd.y * -0.80 * kL + upR.y * 0.02,
        head.z + fwd.z * -0.80 * kL + upR.z * 0.02,
      );
      tail[0].copy(tmp);
      prevDir.set(-fwd.x, -fwd.y, -fwd.z);
      for (let k = 1; k < TAIL_K; k++) {
        const p0 = tail[k - 1], p1 = tail[k];
        const kk = k / (TAIL_K - 1);
        p1.x += Math.sin(time * 0.8 + k * 0.55) * 0.035 * kk * dt;
        p1.y -= 0.10 * kk * dt;
        p1.z += Math.cos(time * 0.7 + k * 0.5) * 0.035 * kk * dt;
        tmp2.copy(p1).sub(p0);
        const d = tmp2.length();
        if (d > 1e-6) tmp2.multiplyScalar(1 / d); else tmp2.copy(prevDir);
        const stiff = Math.pow(1 - kk, 2.2) * (1 - Math.pow(0.002, dt));
        tmp2.lerp(prevDir, stiff).normalize();
        if (d > tailSeg || stiff > 0.01) p1.copy(p0).addScaledVector(tmp2, Math.min(d, tailSeg));
        prevDir.copy(tmp2);
      }
      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        if (p.kind !== 'tail') continue;
        const fu = (p.d as number) * (TAIL_K - 1.001);
        const k0 = Math.floor(fu), f = fu - k0;
        tmp.copy(tail[k0]).lerp(tail[k0 + 1], f);
        pos[i * 3] = tmp.x + (p.jx as number);
        pos[i * 3 + 1] = tmp.y + (p.jy as number);
        pos[i * 3 + 2] = tmp.z + (p.jz as number);
      }
      pts.geo.attributes.position.needsUpdate = true;
    },
    dispose() { world.scene.remove(pts.points); pts.geo.dispose(); pts.mat.dispose(); },
  };
}
