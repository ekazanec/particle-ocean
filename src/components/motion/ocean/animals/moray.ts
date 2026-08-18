/** Moray — anguilliform curvature wave, breathing jaw, lunge strike. Port of moray.html. */
import * as THREE from 'three';
import { makePoints, type Particle, type WorldCtx } from '@/components/motion/ocean/core';
import { APPEARANCE, mul, paramDefaults, PROPORTIONS, rhythm, SPEED, TURN, WAVE_AMP } from '@/components/motion/ocean/params';
import type { OceanAnimal, OceanParamDef } from '@/components/motion/ocean/types';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

export const MORAY_PARAMS: OceanParamDef[] = [
  SPEED, TURN,
  rhythm('Wave rate', 'Rate of the eel-like wave travelling down the body'),
  WAVE_AMP,
  mul('mouthSpeed', 'Mouth rate', 'How fast the moray opens and closes its jaw (breathing)'),
  mul('mouthOpen', 'Jaw opening', 'How wide the jaw opens while breathing'),
  ...PROPORTIONS, ...APPEARANCE,
];

export function makeMoray(world: WorldCtx): OceanAnimal {
  const cBase = new THREE.Color(0x4f6b38), cDark = new THREE.Color(0x22301a);
  const cSpot = new THREE.Color(0xd9cf9a), cBelly = new THREE.Color(0x8a9464), cTeeth = new THREE.Color(0xfff4dc);

  const SPINE = 90, SEG = 0.034;
  const rspine: THREE.Vector3[] = [], hdirs: THREE.Vector3[] = [];
  for (let i = 0; i < SPINE; i++) { rspine.push(new THREE.Vector3(-1.2 - i * SEG, 0, 0)); hdirs.push(new THREE.Vector3(1, 0, 0)); }

  const smooth = (a: number, b: number, x: number) => { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); };
  function bodyR(u: number): number {
    let r = 0.145;
    r *= 0.88 + 0.12 * smooth(0.04, 0.30, u);
    r *= 1 - 0.10 * smooth(0.30, 0.62, u);
    r *= 1 - 0.90 * Math.pow(smooth(0.60, 1, u), 1.15);
    return r + 0.008;
  }

  const P: Particle[] = [];
  const BODY_N = 4200;
  for (let i = 0; i < BODY_N; i++) {
    const u = Math.pow(Math.random(), 0.9);
    const a = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.random());
    const c = new THREE.Color();
    const spot = Math.random();
    if (spot < 0.16) c.copy(cSpot).multiplyScalar(0.5);
    else if (Math.sin(a) < -0.55) c.copy(cBelly).multiplyScalar(0.55);
    else c.copy(cBase).lerp(cDark, Math.random() * 0.7);
    c.multiplyScalar((0.45 + Math.random() * 0.3) * (1 - 0.25 * u));
    P.push({ kind: 'body', u, a, rr, c });
  }
  const cFin = new THREE.Color(0x4fc9a8);
  for (let i = 0; i < 560; i++) {
    const u = 0.10 + Math.random() * 0.90;
    const h = Math.random();
    P.push({ kind: 'fin', u, h, c: new THREE.Color().copy(cFin).lerp(new THREE.Color(0xbdf0dc), h * 0.5).multiplyScalar((0.26 + Math.random() * 0.14) * (1 - 0.25 * u)) });
  }
  for (let i = 0; i < 260; i++) {
    const u = 0.62 + Math.random() * 0.38;
    const h = Math.random();
    P.push({ kind: 'fin2', u, h, c: new THREE.Color().copy(cFin).lerp(new THREE.Color(0xbdf0dc), h * 0.5).multiplyScalar((0.24 + Math.random() * 0.12) * (1 - 0.25 * u)) });
  }
  const HEAD_N = 900;
  for (let i = 0; i < HEAD_N; i++) {
    const t = Math.random();
    const a = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.random());
    const rad = 0.155 * (1 - 0.42 * t * t);
    const jaw = Math.random() < 0.45 ? -1 : 1;
    const hz0 = Math.sin(a) * rr * rad * 1.05;
    const c = new THREE.Color();
    if (Math.random() < 0.12) c.copy(cSpot).multiplyScalar(0.5);
    else c.copy(cBase).lerp(cDark, Math.random() * 0.7);
    if (Math.abs(hz0) < 0.016 && Math.abs(Math.cos(a)) * rr > 0.55 && t > 0.15) c.copy(cDark).multiplyScalar(0.35);
    c.multiplyScalar(0.5 + Math.random() * 0.3);
    P.push({ kind: 'head', t, hx: Math.cos(a) * rr * rad * 0.92, hz0, jaw: hz0 < 0 ? jaw : 0, c });
  }
  for (const jaw of [1, -1]) for (let i = 0; i < 34; i++) {
    const t = 0.45 + Math.random() * 0.5;
    const sgn = Math.random() < 0.5 ? -1 : 1;
    P.push({ kind: 'tooth', t, hx: sgn * 0.05 * (1 - 0.5 * t), jaw, c: new THREE.Color().copy(cTeeth).multiplyScalar(0.5 + Math.random() * 0.3) });
  }
  for (const sgn of [-1, 1]) for (let i = 0; i < 10; i++) {
    P.push({ kind: 'head', t: 0.62 + (Math.random() - 0.5) * 0.03, hx: sgn * (0.095 + (Math.random() - 0.5) * 0.008), hz0: 0.08 + (Math.random() - 0.5) * 0.008, jaw: 0,
      c: new THREE.Color(0x9fb8a0).multiplyScalar(0.5 + Math.random() * 0.25) });
  }
  for (const sgn of [-1, 1]) for (let i = 0; i < 9; i++) {
    const d = Math.random();
    P.push({ kind: 'head', t: 0.96 + (Math.random() - 0.5) * 0.02, hx: sgn * (0.035 + (Math.random() - 0.5) * 0.008), hz0: 0.045 + d * 0.035, jaw: 0,
      c: new THREE.Color().copy(cSpot).multiplyScalar(0.4 + 0.2 * d) });
  }

  const pts = makePoints(world, P, { size: 0.065 });
  const pos = pts.pos;

  const headP = rspine[0];
  const dir = new THREE.Vector3(1, 0, 0);
  const dirVel = new THREE.Vector3();
  let speed = 0.5;
  let wavePh = 0;
  let gape = 0, gapeT = 0;
  let strikeT = -10, armed = true;

  const side = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const fwdS = new THREE.Vector3(), sideS = new THREE.Vector3(), upS = new THREE.Vector3();
  const swimDir = new THREE.Vector3();
  const bp = paramDefaults(MORAY_PARAMS);

  return {
    cloud: pts,
    head: headP,
    p: bp,
    update(cursor, dt, time) {
      tmp2.copy(cursor).sub(headP);
      const dist = tmp2.length();
      if (dist > 0.001) tmp2.normalize();
      const frenzy = Math.min(1, dist / 2.2);

      const behind_tmp2 = tmp2.dot(dir);
      if (behind_tmp2 < -0.35 && dist > 0.001) {
        const px = -dir.z, pz = dir.x;
        const sgn = tmp2.x * px + tmp2.z * pz >= 0 ? 1 : -1;
        const w = (-behind_tmp2 - 0.35) * 1.8;
        tmp2.x += px * sgn * w; tmp2.z += pz * sgn * w;
        tmp2.normalize();
      }
      tmp.copy(tmp2).sub(dir);
      dirVel.addScaledVector(tmp, 1.1 * bp.turn * dt);
      dirVel.multiplyScalar(Math.pow(0.25, dt));
      const av = dirVel.length();
      const avCap = 1.5 * bp.turn;
      if (av > avCap) dirVel.multiplyScalar(avCap / av);
      dir.addScaledVector(dirVel, dt).normalize();
      if (Math.abs(dir.y) > 0.55) { dir.y = Math.sign(dir.y) * 0.55; dir.normalize(); }

      const off = headP.length();
      if (off > 6.5) { tmp.copy(headP).multiplyScalar(-1 / off); dir.lerp(tmp, (off - 6.5) * 1.2 * dt).normalize(); }

      if (dist > 2.2) armed = true;
      if (armed && dist < 1.8 && time - strikeT > 1.6 && tmp2.dot(dir) > 0.7) { strikeT = time; armed = false; }
      const strike = Math.max(0, 1 - (time - strikeT) / 0.5);

      const slowM = Math.min(1, Math.max(0.3, dist / 1.6));
      const targetSpeed = ((0.45 + 0.75 * frenzy) * slowM + 2.0 * strike) * bp.speed;
      speed += (targetSpeed - speed) * (1 - Math.pow(strike > 0 ? 0.02 : 0.3, dt));
      const waveF = (0.9 + speed * 0.9) * bp.rhythm;
      wavePh += waveF * dt;

      side.crossVectors(WORLD_UP, dir);
      if (side.lengthSq() < 1e-4) side.set(0, 0, 1); else side.normalize();
      swimDir.copy(dir);
      headP.addScaledVector(swimDir, speed * dt);

      gapeT += dt * bp.mouthSpeed;
      const breathe = Math.min(1, (0.25 + 0.2 * Math.sin(gapeT * 1.1)) * bp.mouthOpen);
      gape += ((strike > 0 ? 1.0 : breathe) - gape) * (1 - Math.pow(0.03, dt * bp.mouthSpeed));

      hdirs[0].copy(dir);
      const waveK = 9.4;
      const prop = Math.min(1, (0.35 + speed) * dt / SEG * 0.55);
      for (let k = 1; k < SPINE; k++) hdirs[k].lerp(hdirs[k - 1], prop).normalize();
      rspine[0].copy(headP);
      // «Proportions»: kL stretches the spine segments (length), kW/kT scale
      // the cross-section at composition below (width / dorso-ventral)
      const kL = bp.bodyLen, kW = bp.bodyWide, kT = bp.bodyThick;
      const waveScale = (0.30 + 0.70 * Math.min(1, speed)) * bp.waveAmp;
      for (let k = 1; k < SPINE; k++) {
        const uu = k / (SPINE - 1);
        const A = (0.20 + 2.5 * Math.pow(uu, 1.35)) * waveScale;
        const th = Math.sin(wavePh * Math.PI * 2 - uu * waveK) * A;
        const h = hdirs[k];
        const ct = Math.cos(th), st = Math.sin(th);
        tmp.set(h.x * ct + h.z * st, h.y, -h.x * st + h.z * ct);
        rspine[k].copy(rspine[k - 1]).addScaledVector(tmp, -SEG * kL);
      }

      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        if (p.kind === 'body' || p.kind === 'fin' || p.kind === 'fin2') {
          const u = p.u as number;
          const fi = u * (SPINE - 2);
          const i0 = Math.floor(fi), f = fi - i0;
          tmp.copy(rspine[i0]).lerp(rspine[i0 + 1], f);
          fwdS.copy(rspine[Math.max(0, i0 - 1)]).sub(rspine[Math.min(SPINE - 1, i0 + 2)]).normalize();
          sideS.crossVectors(WORLD_UP, fwdS);
          if (sideS.lengthSq() < 1e-4) sideS.set(0, 0, 1); else sideS.normalize();
          upS.crossVectors(fwdS, sideS).normalize();
          if (p.kind === 'body') {
            const R = bodyR(u);
            const wSide = 1 - 0.28 * u;
            const lx = Math.cos(p.a as number) * (p.rr as number) * R * wSide * kW;
            const lz = Math.sin(p.a as number) * (p.rr as number) * R * kT;
            pos[i * 3] = tmp.x + sideS.x * lx + upS.x * lz;
            pos[i * 3 + 1] = tmp.y + sideS.y * lx + upS.y * lz;
            pos[i * 3 + 2] = tmp.z + sideS.z * lx + upS.z * lz;
          } else {
            const R = bodyR(u);
            const h = p.h as number;
            const isLow = p.kind === 'fin2';
            const hFin = 0.045 * (0.4 + 0.6 * Math.sin(Math.PI * Math.min(1, u * 1.1))) + 0.014;
            const finH = (isLow ? -(R * 0.9 + h * hFin * smooth(0.62, 0.85, u)) : R + h * hFin) * kT;
            const flut = Math.sin(wavePh * Math.PI * 2 - u * waveK - h * 0.8) * 0.015 * h * kW;
            pos[i * 3] = tmp.x + sideS.x * flut + upS.x * finH;
            pos[i * 3 + 1] = tmp.y + sideS.y * flut + upS.y * finH;
            pos[i * 3 + 2] = tmp.z + sideS.z * flut + upS.z * finH;
          }
        } else {
          fwdS.copy(rspine[0]).sub(rspine[3]).normalize();
          sideS.crossVectors(WORLD_UP, fwdS);
          if (sideS.lengthSq() < 1e-4) sideS.set(0, 0, 1); else sideS.normalize();
          upS.crossVectors(fwdS, sideS).normalize();
          const hx = p.hx as number;
          let hy: number, hz: number;
          if (p.kind === 'tooth') {
            hy = 0.06 + (p.t as number) * 0.24;
            hz = (p.jaw as number) > 0 ? -0.005 : -0.025;
            const ja = gape * 0.5 * ((p.jaw as number) > 0 ? 0.35 : -0.65);
            const cy = hy * Math.cos(ja) - hz * Math.sin(ja), cz = hy * Math.sin(ja) + hz * Math.cos(ja);
            hy = cy; hz = cz;
          } else {
            hy = (p.t as number) * 0.42 - 0.12;
            hz = p.hz0 as number;
            if ((p.jaw as number) !== 0 && (p.t as number) > 0.4) {
              const ja = gape * 0.5 * ((p.jaw as number) > 0 ? 0.35 : -0.65);
              const cy = hy * Math.cos(ja) - hz * Math.sin(ja), cz = hy * Math.sin(ja) + hz * Math.cos(ja);
              hy = cy; hz = cz;
            }
          }
          // proportions: head stretches/widens with the body so the seam at
          // the first spine segment never opens
          const hys = hy * kL, hxs = hx * kW, hzs = hz * kT;
          pos[i * 3] = rspine[0].x + fwdS.x * hys + sideS.x * hxs + upS.x * hzs;
          pos[i * 3 + 1] = rspine[0].y + fwdS.y * hys + sideS.y * hxs + upS.y * hzs;
          pos[i * 3 + 2] = rspine[0].z + fwdS.z * hys + sideS.z * hxs + upS.z * hzs;
        }
      }
      pts.geo.attributes.position.needsUpdate = true;
    },
    dispose() { world.scene.remove(pts.points); pts.geo.dispose(); pts.mat.dispose(); },
  };
}
