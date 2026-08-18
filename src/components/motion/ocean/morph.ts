/*!
 * particle-ocean · https://github.com/ekazanec/particle-ocean
 * Copyright (c) 2026 Andrey Gurov · https://agurov.com
 * MIT licensed. If you ship something built on this, a link back is appreciated.
 */
/**
 * Morph choreographies — three selectable IN-PLACE animal→animal transitions.
 *
 * The legacy morph (inline in ocean-hero.tsx) scatters the dying creature
 * where it is but reassembles the next one from a random shell around the
 * ORIGIN — a visual recenter. Every variant here instead captures the
 * creature's world position (and smoothed heading velocity) at trigger time
 * and pins the whole birth there, using the position-pin override pattern:
 * every species places its particles relative to a live mutable `head`
 * vector each frame, so copying the anchor into the freshly spawned head
 * relocates physics + rendering with zero distortion.
 *
 * Variants:
 *  - flow   («Flow»)  — liquid dissolve-reform: each new particle departs
 *    from a resampled point of the old body on a spatially-correlated,
 *    noise-staggered delay and flows into the new shape; the whole cloud
 *    keeps drifting on the old heading while it happens.
 *  - pulse  («Pulse»)  — the old body contracts into a dense luminous core
 *    (additive blending does the glow for free), one heartbeat, then blooms
 *    outward into the new shape with a slight overshoot. Reads as rebirth.
 *  - vortex («Vortex»)  — particles are swept into a water-swirl around the
 *    anchor (angular speed grows toward the center, like a drain), and the
 *    new creature condenses out of the same swirl, which unwinds as the
 *    shape settles and swims on.
 *
 * Easing vocabulary follows the GSAP timing wisdom (power-curves, back.out
 * overshoot, no linear ramps) but is implemented as closed-form functions —
 * the engine is a custom rAF/Three.js particle loop, GSAP is deliberately
 * NOT a dependency of the hero.
 *
 * 60fps discipline: all Float32Array scratch buffers are allocated once at
 * trigger/spawn time; the per-frame loops do arithmetic only.
 *
 * prefers-reduced-motion: the hero never runs the animation loop in that
 * mode (single static frame, no morphs), so no reduced path is needed here.
 */
import * as THREE from 'three';
import type { PointCloud } from '@/components/motion/ocean/core';

export type MorphVariantId = 'legacy' | 'flow' | 'pulse' | 'vortex';

/** Lab picker labels (legacy = the shipped behavior, kept as the default). */
export const MORPH_VARIANTS: Array<{ id: MorphVariantId; label: string }> = [
  { id: 'legacy', label: 'Current (scatter to reassemble)' },
  { id: 'flow', label: 'V1 · Flow' },
  { id: 'pulse', label: 'V2 · Pulse' },
  { id: 'vortex', label: 'V3 · Vortex' },
];

export interface MorphFx {
  /** Seconds after trigger before the next animal should spawn. */
  readonly spawnDelay: number;
  /** World-space position of the creature at trigger — the pin target. */
  readonly anchor: THREE.Vector3;
  /**
   * Unit body-axis direction of the OLD creature at trigger (tail → head).
   * Estimated as centroid→head (sign-correct for elongated bodies even when
   * hovering), falling back to the travel velocity, then +x. The host uses
   * it to warm-start the new swimmer so heading is inherited, and flow uses
   * it for the anatomical particle correspondence.
   */
  readonly heading: THREE.Vector3;
  /** Internal clock, advanced by tick(); the host reads it for spawn timing. */
  readonly time: number;
  /** Advance the ghost (old body) choreography. Call every frame. */
  tick(dt: number): void;
  /**
   * Called once right after the new animal spawns with its head already
   * pinned to `anchor / scale`. `invScale` converts world units into the new
   * cloud's unscaled local space (Points.scale multiplies positions).
   */
  initAssemble(cloud: PointCloud, head: THREE.Vector3, invScale: number): void;
  /**
   * Blend the freshly-written live particle positions with the choreography.
   * Call every frame after animal.update() (+ clamps). Returns true when the
   * morph is complete and the fx can be disposed.
   */
  blend(cloud: PointCloud, head: THREE.Vector3, dt: number): boolean;
  dispose(): void;
}

/* ---------------------------------------------------------------- easing */

const smootherstep = (x: number): number => x * x * x * (x * (x * 6 - 15) + 10);
const smoothstep = (x: number): number => x * x * (3 - 2 * x);
const easeInCubic = (x: number): number => x * x * x;
const easeOutCubic = (x: number): number => 1 - (1 - x) * (1 - x) * (1 - x);
/** back.out with a gentle overshoot — the "bloom breathes past the form". */
function backOut(x: number, s = 0.9): number {
  const t = x - 1;
  return 1 + (s + 1) * t * t * t + s * t * t;
}
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/* ----------------------------------------------------------------- ghost */

interface Ghost {
  geo: THREE.BufferGeometry;
  mat: THREE.PointsMaterial;
  points: THREE.Points;
  N: number;
  arr: Float32Array;
}

abstract class BaseFx implements MorphFx {
  abstract readonly spawnDelay: number;
  readonly anchor: THREE.Vector3;
  readonly heading = new THREE.Vector3(1, 0, 0);
  time = 0;

  protected scene: THREE.Scene;
  protected ghost: Ghost | null;
  /** Old body particle positions baked into WORLD space (scale applied). */
  protected from: Float32Array;
  protected oldN: number;
  protected baseOpacity: number;
  /** Smoothed world-space heading velocity at trigger (magnitude clamped). */
  protected vel: THREE.Vector3;

  constructor(scene: THREE.Scene, src: PointCloud, head: THREE.Vector3, headVel: THREE.Vector3) {
    this.scene = scene;
    const s = src.points.scale.x;
    this.anchor = head.clone().multiplyScalar(s);
    this.vel = headVel.clone().multiplyScalar(s);
    const vlen = this.vel.length();
    if (vlen > 1.2) this.vel.multiplyScalar(1.2 / vlen);
    this.oldN = src.N;
    this.baseOpacity = src.mat.opacity;

    // bake scale into the snapshot so all fx math lives in world units and
    // the ghost renders exactly where the animal was (Points.scale left at 1)
    const N3 = src.N * 3;
    this.from = new Float32Array(N3);
    for (let i = 0; i < N3; i++) this.from[i] = src.pos[i] * s;

    // Heading estimate, in priority order:
    // 1. Smoothed travel velocity — creatures swim head-first, and at a
    //    catch-trigger the strike velocity is strong and true.
    // 2. Centroid→head offset — sign-correct ONLY for spinal species whose
    //    body trails BEHIND the head (moray, eels). For body-of-revolution
    //    swimmers head is the body CENTER, the offset is ~0 and normalizing
    //    it amplifies undulation noise into a random direction, hence the
    //    magnitude gate and why velocity comes first.
    // 3. +x (species-default) as the last resort.
    this.heading.copy(this.vel);
    if (this.heading.length() < 0.2) {
      let cx = 0, cy = 0, cz = 0;
      for (let i = 0; i < N3; i += 3) {
        cx += this.from[i];
        cy += this.from[i + 1];
        cz += this.from[i + 2];
      }
      const invN = 1 / this.oldN;
      this.heading.set(this.anchor.x - cx * invN, this.anchor.y - cy * invN, this.anchor.z - cz * invN);
      if (this.heading.length() < 0.15) this.heading.set(1, 0, 0);
    }
    this.heading.normalize();
    // Pitch-clamp the inherited course like Swimmer does (|dir.y| ≤ ~0.72):
    // a body-bend can bias the centroid estimate steeper than any swimmer
    // can physically orient, which would leave the warm-start chasing an
    // unreachable target and report a phantom heading error.
    if (Math.abs(this.heading.y) > 0.68) {
      this.heading.y = Math.sign(this.heading.y) * 0.68;
      this.heading.normalize();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.from), 3));
    geo.setAttribute('color', src.geo.getAttribute('color').clone());
    const mat = src.mat.clone();
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);
    this.ghost = {
      geo,
      mat,
      points,
      N: src.N,
      arr: (geo.getAttribute('position') as THREE.BufferAttribute).array as Float32Array,
    };
  }

  abstract tick(dt: number): void;
  abstract initAssemble(cloud: PointCloud, head: THREE.Vector3, invScale: number): void;
  abstract blend(cloud: PointCloud, head: THREE.Vector3, dt: number): boolean;

  protected killGhost(): void {
    if (!this.ghost) return;
    this.scene.remove(this.ghost.points);
    this.ghost.geo.dispose();
    this.ghost.mat.dispose();
    this.ghost = null;
  }

  dispose(): void {
    this.killGhost();
  }
}

/* ------------------------------------------------------------------ flow */

const FLOW_GHOST_T = 0.75;
const FLOW_DELAY_MAX = 0.55;
const FLOW_TRAVEL = 0.85;
const FLOW_TOTAL = FLOW_DELAY_MAX + FLOW_TRAVEL; // 1.4s

class FlowFx extends BaseFx {
  readonly spawnDelay = 0;
  /** Per-old-particle dissolve drift (gentle outward + noise), world u/s. */
  private nvel: Float32Array;
  /** Old particle indices sorted tail→head along the body axis. */
  private oldOrder: Uint32Array;
  private fromLocal: Float32Array | null = null;
  private delays: Float32Array | null = null;
  private needInit = true;
  private invScale = 1;
  private velLocal = new THREE.Vector3();
  private driftOff = new THREE.Vector3();

  constructor(scene: THREE.Scene, src: PointCloud, head: THREE.Vector3, headVel: THREE.Vector3) {
    super(scene, src, head, headVel);
    const N = this.oldN;
    this.nvel = new Float32Array(N * 3);
    const a = this.anchor;
    for (let i = 0; i < N; i++) {
      const j = i * 3;
      // outward-from-anchor bias + isotropic noise = soft liquid dissolve
      let ox = this.from[j] - a.x, oy = this.from[j + 1] - a.y, oz = this.from[j + 2] - a.z;
      const ol = Math.hypot(ox, oy, oz) || 1;
      ox /= ol; oy /= ol; oz /= ol;
      this.nvel[j] = ox * 0.22 + (Math.random() - 0.5) * 0.4;
      this.nvel[j + 1] = oy * 0.22 + (Math.random() - 0.5) * 0.4 + 0.06; // slight buoyancy
      this.nvel[j + 2] = oz * 0.22 + (Math.random() - 0.5) * 0.4;
    }
    // longitudinal rank of every old particle along the body axis — one half
    // of the anatomical correspondence (head births head, tail births tail)
    const h = this.heading;
    const sOld = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const j = i * 3;
      sOld[i] = (this.from[j] - a.x) * h.x + (this.from[j + 1] - a.y) * h.y + (this.from[j + 2] - a.z) * h.z;
    }
    this.oldOrder = new Uint32Array(N);
    for (let i = 0; i < N; i++) this.oldOrder[i] = i;
    this.oldOrder.sort((p, q) => sOld[p] - sOld[q]);
  }

  tick(dt: number): void {
    this.time += dt;
    const g = this.ghost;
    if (!g) return;
    const t = Math.min(1, this.time / FLOW_GHOST_T);
    const decay = 1 - smoothstep(t);
    const arr = g.arr;
    const vx = this.vel.x * 0.9, vy = this.vel.y * 0.9, vz = this.vel.z * 0.9;
    const nv = this.nvel;
    for (let i = 0; i < g.N * 3; i += 3) {
      arr[i] += (vx + nv[i]) * decay * dt;
      arr[i + 1] += (vy + nv[i + 1]) * decay * dt;
      arr[i + 2] += (vz + nv[i + 2]) * decay * dt;
    }
    (g.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    g.mat.opacity = this.baseOpacity * (1 - smoothstep(t));
    if (t >= 1) this.killGhost();
  }

  initAssemble(cloud: PointCloud, _head: THREE.Vector3, invScale: number): void {
    // The new cloud has no live positions yet (first update() runs later
    // this same frame), so the correspondence is built lazily on the first
    // blend() call — trigger-time work either way, nothing per-frame.
    this.invScale = invScale;
    this.velLocal.copy(this.vel).multiplyScalar(invScale);
    this.needInit = true;
  }

  /**
   * Anatomical correspondence: project BOTH bodies onto the shared heading
   * axis, sort, and pair by relative longitudinal rank (quantile matching) —
   * the old head births the new head, the old tail births the new tail.
   */
  private buildCorrespondence(cloud: PointCloud, head: THREE.Vector3): void {
    const N = cloud.N;
    this.fromLocal = new Float32Array(N * 3);
    this.delays = new Float32Array(N);
    const pos = cloud.pos;
    const h = this.heading;
    const sNew = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const j = i * 3;
      sNew[i] = (pos[j] - head.x) * h.x + (pos[j + 1] - head.y) * h.y + (pos[j + 2] - head.z) * h.z;
    }
    const order = new Uint32Array(N);
    for (let i = 0; i < N; i++) order[i] = i;
    order.sort((p, q) => sNew[p] - sNew[q]);
    const inv = this.invScale;
    const rankK = N > 1 ? (this.oldN - 1) / (N - 1) : 0;
    for (let r = 0; r < N; r++) {
      const i = order[r];
      const jOld = this.oldOrder[Math.round(r * rankK)] * 3;
      const wx = this.from[jOld], wy = this.from[jOld + 1], wz = this.from[jOld + 2];
      this.fromLocal[i * 3] = wx * inv;
      this.fromLocal[i * 3 + 1] = wy * inv;
      this.fromLocal[i * 3 + 2] = wz * inv;
      // departure wave runs head → tail (q=1 at the head), organic grain on top
      const q = N > 1 ? r / (N - 1) : 1;
      const noise = 0.5 + 0.5 * Math.sin(wx * 2.3 + wy * 3.7 + wz * 2.9);
      this.delays[i] = FLOW_DELAY_MAX * (0.55 * (1 - q) + 0.35 * noise + 0.1 * Math.random());
    }
    this.needInit = false;
  }

  blend(cloud: PointCloud, head: THREE.Vector3, dt: number): boolean {
    if (this.needInit) this.buildCorrespondence(cloud, head);
    const fromL = this.fromLocal, delays = this.delays;
    if (!fromL || !delays) return true;
    const t = this.time;
    // the departed shape keeps drifting on the old heading, fading out
    const drift = 1 - clamp01(t / FLOW_TOTAL);
    this.driftOff.addScaledVector(this.velLocal, drift * dt);
    const ox = this.driftOff.x, oy = this.driftOff.y, oz = this.driftOff.z;
    const pos = cloud.pos;
    for (let i = 0; i < cloud.N; i++) {
      const ti = clamp01((t - delays[i]) / FLOW_TRAVEL);
      const e = smootherstep(ti);
      const j = i * 3;
      const fx = fromL[j] + ox, fy = fromL[j + 1] + oy, fz = fromL[j + 2] + oz;
      pos[j] = fx + (pos[j] - fx) * e;
      pos[j + 1] = fy + (pos[j + 1] - fy) * e;
      pos[j + 2] = fz + (pos[j + 2] - fz) * e;
    }
    cloud.mat.opacity = this.baseOpacity * (0.45 + 0.55 * smoothstep(clamp01(t / 0.9)));
    return t >= FLOW_TOTAL && !this.ghost;
  }
}

/* ----------------------------------------------------------------- pulse */

const PULSE_CONTRACT = 0.5;
const PULSE_BEAT = 0.16;
const PULSE_BLOOM = 1.05;
const PULSE_CORE_R = 0.12;
const PULSE_STAGGER = 0.28;

class PulseFx extends BaseFx {
  readonly spawnDelay = PULSE_CONTRACT + PULSE_BEAT;
  /** World-space core target per old particle (anchor + tight jitter). */
  private core: Float32Array;
  private fromLocal: Float32Array | null = null;
  private delays: Float32Array | null = null;
  private needDelays = true;
  private invScale = 1;

  constructor(scene: THREE.Scene, src: PointCloud, head: THREE.Vector3, headVel: THREE.Vector3) {
    super(scene, src, head, headVel);
    const N = this.oldN;
    this.core = new Float32Array(N * 3);
    const a = this.anchor;
    for (let i = 0; i < N; i++) {
      const [x, y, z] = randInSphere(PULSE_CORE_R);
      this.core[i * 3] = a.x + x;
      this.core[i * 3 + 1] = a.y + y;
      this.core[i * 3 + 2] = a.z + z;
    }
  }

  tick(dt: number): void {
    this.time += dt;
    const g = this.ghost;
    if (!g) return;
    const t = this.time;
    const arr = g.arr;
    const a = this.anchor;
    if (t < PULSE_CONTRACT) {
      // accelerating implosion — the body inhales itself into the core
      const k = easeInCubic(clamp01(t / PULSE_CONTRACT));
      for (let i = 0; i < g.N * 3; i++) arr[i] = this.from[i] + (this.core[i] - this.from[i]) * k;
      g.mat.opacity = Math.min(1, this.baseOpacity * (1 + 0.5 * k));
    } else {
      // one heartbeat: the core squeezes and releases before the bloom
      const tb = clamp01((t - PULSE_CONTRACT) / PULSE_BEAT);
      const s = 1 - 0.24 * Math.sin(Math.PI * tb);
      for (let i = 0; i < g.N * 3; i += 3) {
        arr[i] = a.x + (this.core[i] - a.x) * s;
        arr[i + 1] = a.y + (this.core[i + 1] - a.y) * s;
        arr[i + 2] = a.z + (this.core[i + 2] - a.z) * s;
      }
      g.mat.opacity = 1;
    }
    (g.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    if (t >= this.spawnDelay) this.killGhost(); // the new cloud's core takes over seamlessly
  }

  initAssemble(cloud: PointCloud, head: THREE.Vector3, invScale: number): void {
    const N = cloud.N;
    this.invScale = invScale;
    this.fromLocal = new Float32Array(N * 3);
    this.delays = new Float32Array(N);
    this.needDelays = true; // computed on first blend, when live positions exist
    const r = PULSE_CORE_R * invScale;
    for (let i = 0; i < N; i++) {
      const [x, y, z] = randInSphere(r);
      this.fromLocal[i * 3] = head.x + x;
      this.fromLocal[i * 3 + 1] = head.y + y;
      this.fromLocal[i * 3 + 2] = head.z + z;
    }
  }

  blend(cloud: PointCloud, head: THREE.Vector3, _dt: number): boolean {
    const fromL = this.fromLocal, delays = this.delays;
    if (!fromL || !delays) return true;
    const ta = this.time - this.spawnDelay;
    if (this.needDelays) {
      // bloom inner-out: particles closer to the head unfurl first
      const reach = 1.6 * this.invScale;
      const pos = cloud.pos;
      for (let i = 0; i < cloud.N; i++) {
        const j = i * 3;
        const d = Math.hypot(pos[j] - head.x, pos[j + 1] - head.y, pos[j + 2] - head.z);
        delays[i] = PULSE_STAGGER * clamp01(d / reach);
      }
      this.needDelays = false;
    }
    const travel = PULSE_BLOOM - PULSE_STAGGER;
    const pos = cloud.pos;
    for (let i = 0; i < cloud.N; i++) {
      const ti = clamp01((ta - delays[i]) / travel);
      const e = backOut(ti); // slight overshoot — bloom breathes past the form
      const j = i * 3;
      pos[j] = fromL[j] + (pos[j] - fromL[j]) * e;
      pos[j + 1] = fromL[j + 1] + (pos[j + 1] - fromL[j + 1]) * e;
      pos[j + 2] = fromL[j + 2] + (pos[j + 2] - fromL[j + 2]) * e;
    }
    cloud.mat.opacity = this.baseOpacity * (0.5 + 0.5 * easeOutCubic(clamp01(ta / PULSE_BLOOM)));
    return ta >= PULSE_BLOOM;
  }
}

/* ---------------------------------------------------------------- vortex */

const VORTEX_SWEEP = 0.7;
const VORTEX_SPAWN = 0.45; // new creature condenses while the swirl still lives
const VORTEX_GHOST_END = 1.0;
const VORTEX_SETTLE = 1.4;
const VORTEX_TRAVEL = 0.8;
const VORTEX_R_MIN = 0.32;
const VORTEX_R_SPAN = 0.75;
const GOLDEN_ANGLE = 2.399963229728653;

class VortexFx extends BaseFx {
  readonly spawnDelay = VORTEX_SPAWN;
  private sd: number; // swirl direction, tied to the old heading
  // ghost cylindrical state around the anchor (screen-plane swirl)
  private gR0: Float32Array;
  private gRB: Float32Array;
  private gTh: Float32Array;
  private gZ0: Float32Array;
  // new-cloud swirl state (local space, centered on the live head)
  private nR: Float32Array | null = null;
  private nTh: Float32Array | null = null;
  private nZ: Float32Array | null = null;
  private nOmega: Float32Array | null = null;
  private delays: Float32Array | null = null;

  constructor(scene: THREE.Scene, src: PointCloud, head: THREE.Vector3, headVel: THREE.Vector3) {
    super(scene, src, head, headVel);
    this.sd = this.vel.x + this.vel.y >= 0 ? 1 : -1;
    const N = this.oldN;
    this.gR0 = new Float32Array(N);
    this.gRB = new Float32Array(N);
    this.gTh = new Float32Array(N);
    this.gZ0 = new Float32Array(N);
    const a = this.anchor;
    for (let i = 0; i < N; i++) {
      const dx = this.from[i * 3] - a.x;
      const dy = this.from[i * 3 + 1] - a.y;
      this.gR0[i] = Math.hypot(dx, dy);
      this.gTh[i] = Math.atan2(dy, dx);
      this.gRB[i] = VORTEX_R_MIN + VORTEX_R_SPAN * Math.pow(Math.random(), 0.7);
      this.gZ0[i] = this.from[i * 3 + 2] - a.z;
    }
  }

  tick(dt: number): void {
    this.time += dt;
    const g = this.ghost;
    if (!g) return;
    const t = this.time;
    const k = smoothstep(clamp01(t / VORTEX_SWEEP));
    // angular envelope: ramps in, holds through the sweep, releases after
    const env =
      smoothstep(clamp01(t / 0.25)) * (t < VORTEX_SWEEP ? 1 : Math.max(0, 1 - (t - VORTEX_SWEEP) / 0.3));
    const arr = g.arr;
    const a = this.anchor;
    const sd = this.sd;
    for (let i = 0; i < g.N; i++) {
      const r = this.gR0[i] + (this.gRB[i] - this.gR0[i]) * k;
      this.gTh[i] += sd * (1.4 + 2.2 / (0.25 + r)) * env * dt; // faster inside, like a drain
      const j = i * 3;
      arr[j] = a.x + Math.cos(this.gTh[i]) * r;
      arr[j + 1] = a.y + Math.sin(this.gTh[i]) * r;
      arr[j + 2] = a.z + this.gZ0[i] * (1 - k * 0.8);
    }
    (g.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    g.mat.opacity =
      t < VORTEX_SPAWN
        ? this.baseOpacity
        : this.baseOpacity * Math.max(0, 1 - (t - VORTEX_SPAWN) / (VORTEX_GHOST_END - VORTEX_SPAWN));
    if (t >= VORTEX_GHOST_END) this.killGhost();
  }

  initAssemble(cloud: PointCloud, _head: THREE.Vector3, invScale: number): void {
    const N = cloud.N;
    this.nR = new Float32Array(N);
    this.nTh = new Float32Array(N);
    this.nZ = new Float32Array(N);
    this.nOmega = new Float32Array(N);
    this.delays = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const rW = VORTEX_R_MIN + VORTEX_R_SPAN * Math.pow(Math.random(), 0.7); // world units
      this.nR[i] = rW * invScale;
      this.nTh[i] = i * GOLDEN_ANGLE + (Math.random() - 0.5) * 0.3;
      this.nZ[i] = (Math.random() - 0.5) * 0.25 * invScale;
      this.nOmega[i] = this.sd * (1.2 + 2.0 / (0.25 + rW));
      // inner rings settle into the body first — the shape grows outward
      this.delays[i] = (0.55 * (rW - VORTEX_R_MIN)) / VORTEX_R_SPAN + Math.random() * 0.05;
    }
  }

  blend(cloud: PointCloud, head: THREE.Vector3, dt: number): boolean {
    const nR = this.nR, nTh = this.nTh, nZ = this.nZ, nOmega = this.nOmega, delays = this.delays;
    if (!nR || !nTh || !nZ || !nOmega || !delays) return true;
    const ta = this.time - VORTEX_SPAWN;
    const tg = clamp01(ta / VORTEX_SETTLE);
    const decay = 1 - smoothstep(tg); // the swirl unwinds as the body settles
    const pos = cloud.pos;
    // swirl center = live head: the whirl travels WITH the creature, so the
    // settled particles never stretch back to a stale anchor
    const hx = head.x, hy = head.y, hz = head.z;
    for (let i = 0; i < cloud.N; i++) {
      nTh[i] += nOmega[i] * decay * dt;
      const fx = hx + Math.cos(nTh[i]) * nR[i];
      const fy = hy + Math.sin(nTh[i]) * nR[i];
      const fz = hz + nZ[i];
      const ti = clamp01((ta - delays[i]) / VORTEX_TRAVEL);
      const e = smootherstep(ti);
      const j = i * 3;
      pos[j] = fx + (pos[j] - fx) * e;
      pos[j + 1] = fy + (pos[j + 1] - fy) * e;
      pos[j + 2] = fz + (pos[j + 2] - fz) * e;
    }
    cloud.mat.opacity = this.baseOpacity * (0.3 + 0.7 * easeOutCubic(tg));
    return ta >= VORTEX_SETTLE;
  }
}

/* --------------------------------------------------------------- factory */

function randInSphere(r: number): [number, number, number] {
  const a = Math.random() * Math.PI * 2;
  const b = Math.acos(Math.random() * 2 - 1);
  const rr = r * Math.cbrt(Math.random());
  return [Math.sin(b) * Math.cos(a) * rr, Math.cos(b) * rr, Math.sin(b) * Math.sin(a) * rr];
}

export function makeMorphFx(
  variant: Exclude<MorphVariantId, 'legacy'>,
  scene: THREE.Scene,
  src: PointCloud,
  head: THREE.Vector3,
  headVel: THREE.Vector3,
): MorphFx {
  switch (variant) {
    case 'flow':
      return new FlowFx(scene, src, head, headVel);
    case 'pulse':
      return new PulseFx(scene, src, head, headVel);
    case 'vortex':
      return new VortexFx(scene, src, head, headVel);
  }
}
