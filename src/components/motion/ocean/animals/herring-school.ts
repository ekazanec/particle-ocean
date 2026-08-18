/**
 * Herring school — 560 fish morphing between formations (bait ball, torus,
 * wave sheet, vortex funnel, figure-eight ribbon, hourglass). The cursor is
 * a predator: the school parts around it and reforms. Port of
 * herring-school.html (formation-name overlay intentionally dropped for hero).
 */
import * as THREE from 'three';
import { makePoints, type Particle, type WorldCtx } from '@/components/motion/ocean/core';
import { mul, paramDefaults, PARTICLE_SIZE, PROPORTIONS } from '@/components/motion/ocean/params';
import type { OceanAnimal, OceanParamDef } from '@/components/motion/ocean/types';

// No «Turn rate» here on purpose: the school has no steering body —
// individual fish accelerate toward moving formation targets, so a turn-rate
// multiplier would be a placebo. Speed / formation tempo / flee radius are
// the real knobs of this species.
// Appearance: only «Particle size» — hue/sat/bright are deliberately ABSENT:
// the school rewrites its color attribute every frame (panic flash), so a
// host-side color grade would be overwritten instantly (placebo). Proportions
// scale the school's formation ellipsoid instead of a body.
export const HERRING_SCHOOL_PARAMS: OceanParamDef[] = [
  { ...mul('speed', 'Fish speed', 'Multiplier on each fish acceleration and top speed, and on the school fleeing'), range: true },
  mul('formRate', 'Formation change', 'How fast the school rearranges between formations'),
  mul('scatterR', 'Startle radius', 'From what distance the school scatters away from the cursor', 0.3, 2.5),
  ...PROPORTIONS, PARTICLE_SIZE,
];

const NF = 560;
const PPF = 4;

interface Fish {
  p: THREE.Vector3;
  v: THREE.Vector3;
  q: number;
  ph: number;
  panic: number;
}

export function makeHerringSchool(world: WorldCtx): OceanAnimal {
  const cSilver = new THREE.Color(0xcfe0ee), cBlue = new THREE.Color(0x5f88b8), cDark = new THREE.Color(0x2c4666);

  function fib(i: number, n: number): [number, number, number] {
    const golden = Math.PI * (3 - Math.sqrt(5));
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y), th = golden * i;
    return [Math.cos(th) * r, y, Math.sin(th) * r];
  }
  const FORMS: Array<(i: number, q: number, t: number) => [number, number, number]> = [
    (i, q, t) => { const [x, y, z] = fib(i, NF); const r = 1.45 + 0.12 * Math.sin(t * 0.8 + q * 9); return [x * r, y * r, z * r]; },
    (i, q, t) => { const a = q * Math.PI * 2 * 7 + t * 0.25, b = q * Math.PI * 2 * 53;
      const R = 1.7, r = 0.45 + 0.1 * Math.sin(t * 0.6 + q * 20);
      return [(R + r * Math.cos(b)) * Math.cos(a), r * Math.sin(b) + Math.sin(a * 2 + t) * 0.2, (R + r * Math.cos(b)) * Math.sin(a)]; },
    (i, q, t) => { const gx = (i % 34) / 33, gy = Math.floor(i / 34) / Math.ceil(NF / 34);
      return [(gx - 0.5) * 5.2, (gy - 0.5) * 2.6 + Math.sin(gx * 7 + t * 1.3) * 0.55 + Math.sin(gy * 5 - t * 0.9) * 0.3, Math.sin(gx * 4 - t) * 0.7 + Math.sin(gy * 9 + t * 0.7) * 0.3]; },
    (i, q, t) => { const h = q * 2 - 1, a = q * Math.PI * 14 + t * 0.9;
      const r = 0.35 + (1 - Math.abs(h)) * 1.5;
      return [Math.cos(a) * r, h * 2.1, Math.sin(a) * r]; },
    (i, q, t) => { const a = q * Math.PI * 2 + t * 0.22;
      const d = 1 + Math.sin(a) * Math.sin(a);
      const w = Math.sin(q * 60 + t * 1.5) * 0.25;
      return [2.1 * Math.cos(a) / d, 2.1 * Math.sin(a) * Math.cos(a) / d + w, Math.cos(q * 40 - t) * 0.4]; },
    (i, q, t) => { const h = q * 2 - 1, a = q * Math.PI * 20 - t * 0.6;
      const r = 0.25 + Math.abs(h) * 1.5 + 0.08 * Math.sin(t + q * 30);
      return [Math.cos(a) * r, h * 1.9, Math.sin(a) * r]; },
  ];

  const fish: Fish[] = [];
  for (let i = 0; i < NF; i++) {
    fish.push({
      p: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4),
      v: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5),
      q: i / (NF - 1), ph: Math.random() * 6, panic: 0,
    });
  }

  const P: Particle[] = [];
  const baseCol: THREE.Color[] = [];
  for (let i = 0; i < NF; i++) {
    for (let k = 0; k < PPF; k++) {
      const c = new THREE.Color();
      if (k === 1) c.copy(cSilver).multiplyScalar(0.55 + Math.random() * 0.25);
      else if (k === 0) c.copy(cBlue).multiplyScalar(0.4);
      else c.copy(cDark).lerp(cBlue, Math.random() * 0.5).multiplyScalar(0.45);
      baseCol.push(c);
      P.push({ c });
    }
  }
  const pts = makePoints(world, P, { size: 0.055, opacity: 0.9 });
  const pos = pts.pos;
  const col = pts.geo.getAttribute('color') as THREE.BufferAttribute;
  const colA = col.array as Float32Array;

  const HOLD = 9, FADE = 3.5;
  let formA = 0, formB = 1, formT = 0;
  const tmp = new THREE.Vector3(), tgt = new THREE.Vector3(), away = new THREE.Vector3();
  const center = new THREE.Vector3();
  const smooth = (x: number) => x * x * (3 - 2 * x);
  const bp = paramDefaults(HERRING_SCHOOL_PARAMS);

  return {
    cloud: pts,
    head: center,
    p: bp,
    update(cursor, dt, time) {
      const kSp = bp.speed, kR = bp.scatterR;
      // the whole school flees: formation centre repelled by the cursor
      away.copy(center).sub(cursor);
      const cdist = away.length();
      const fleeR = 3.2 * kR;
      if (cdist < fleeR) center.addScaledVector(away.normalize(), (fleeR - cdist) * 1.6 * kSp * dt);
      center.multiplyScalar(Math.pow(0.88, dt));
      const cl = center.length();
      if (cl > 3.5) center.multiplyScalar(3.5 / cl);

      formT += dt * bp.formRate;
      if (formT > HOLD + FADE) {
        formA = formB;
        formB = (formB + 1 + Math.floor(Math.random() * (FORMS.length - 2))) % FORMS.length;
        formT = 0;
      }
      const mix = smooth(Math.min(1, Math.max(0, (formT - HOLD) / FADE)));
      // «Proportions» = school ellipsoid: length → x, thickness → y, width → z
      const kL = bp.bodyLen, kW = bp.bodyWide, kT = bp.bodyThick;

      for (let i = 0; i < NF; i++) {
        const f = fish[i];
        const a = FORMS[formA](i, f.q, time), b = FORMS[formB](i, f.q, time);
        tgt.set(
          (a[0] + (b[0] - a[0]) * mix) * kL + center.x,
          (a[1] + (b[1] - a[1]) * mix) * kT + center.y,
          (a[2] + (b[2] - a[2]) * mix) * kW + center.z,
        );

        tmp.copy(tgt).sub(f.p);
        const d = tmp.length();
        f.v.addScaledVector(tmp, Math.min(2.2, d * 1.6) * kSp * dt / Math.max(d, 0.001));

        for (let s = 0; s < 3; s++) {
          const o = fish[(i * 7 + s * 131 + ((time * 60) | 0)) % NF];
          tmp.copy(f.p).sub(o.p);
          const dd = tmp.lengthSq();
          if (dd < 0.05 && dd > 1e-6) f.v.addScaledVector(tmp, 0.9 * dt / dd);
          else if (dd < 0.6) f.v.addScaledVector(o.v, 0.35 * dt);
        }

        away.copy(f.p).sub(cursor);
        const cd = away.length();
        const panicR = 2.4 * kR;
        if (cd < panicR) {
          f.v.addScaledVector(away.normalize(), (panicR - cd) * 9 * dt);
          f.panic = Math.min(1, f.panic + dt * 6);
        }
        f.panic = Math.max(0, f.panic - dt * 1.2);

        f.v.x += Math.sin(time * 2.1 + f.ph) * 0.05 * dt;
        f.v.y += Math.cos(time * 1.7 + f.ph * 2) * 0.05 * dt;

        const vmax = (1.6 + f.panic * 2.4) * kSp;
        const sp = f.v.length();
        if (sp > vmax) f.v.multiplyScalar(vmax / sp);
        f.p.addScaledVector(f.v, dt);

        const inv = sp > 1e-4 ? 1 / sp : 0;
        const dx = f.v.x * inv, dy = f.v.y * inv, dz = f.v.z * inv;
        const wig = Math.sin(time * 10 + f.ph) * 0.012;
        for (let k = 0; k < PPF; k++) {
          const off = 0.05 - k * 0.035;
          const j = (i * PPF + k) * 3;
          pos[j] = f.p.x + dx * off + (k === 3 ? -dz * wig : 0);
          pos[j + 1] = f.p.y + dy * off;
          pos[j + 2] = f.p.z + dz * off + (k === 3 ? dx * wig : 0);
          const bc = baseCol[i * PPF + k];
          const fl = f.panic * 0.7;
          colA[j] = bc.r + (0.9 - bc.r) * fl;
          colA[j + 1] = bc.g + (0.95 - bc.g) * fl;
          colA[j + 2] = bc.b + (1 - bc.b) * fl;
        }
      }
      pts.geo.attributes.position.needsUpdate = true;
      col.needsUpdate = true;
    },
    dispose() { world.scene.remove(pts.points); pts.geo.dispose(); pts.mat.dispose(); },
  };
}
