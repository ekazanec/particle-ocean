/**
 * Swim primitives — reconstruction of the missing `swim-engine.js` behaviour
 * half: Swimmer (inertial steering + banked roll), Drive (chase/strike gait),
 * and the particle generators body()/fin() + layoutWave().
 *
 * Faithfulness source: the six self-contained prototypes (devil-ray, lionfish,
 * moray, sea-spider, sea-turtle, jellyfish) inline exactly this logic; the
 * constants and call signatures come from the ten swim-engine-based files.
 */
import * as THREE from 'three';
import { BasisSmoother, place, type Particle, type PointCloud } from '@/components/motion/ocean/core';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

export interface SwimmerOpts {
  start?: [number, number, number];
  turnK?: number; // steering spring gain
  avMax?: number; // angular velocity cap (rad/s)
  bound?: number; // soft scene boundary radius
  vMax?: number; // linear speed cap
  rollK?: number; // bank-into-turn gain
  rollMax?: number; // bank clamp (rad)
  drag?: number; // per-second velocity retain base (pow(drag, dt))
  pitchMax?: number; // |dir.y| cap — keeps the fish off the vertical pole
}

/** Inertial swimmer: nose turns with angular inertia, body banks into turns. */
export class Swimmer {
  /**
   * Live behavior multipliers (lab «Behavior» tuning; 1 = the authored
   * opts). Written by the species each frame from `animal.p` — plain
   * property writes, no allocation in the hot loop.
   * kSpeed scales thrust + vMax; kTurn scales turnK + avMax.
   */
  kSpeed = 1;
  kTurn = 1;
  head: THREE.Vector3;
  vel = new THREE.Vector3(0.3, 0, 0);
  dir = new THREE.Vector3(1, 0, 0);
  dirVel = new THREE.Vector3();
  side = new THREE.Vector3(0, 0, 1);
  up = new THREE.Vector3(0, 1, 0);
  sideR = new THREE.Vector3(0, 0, 1);
  upR = new THREE.Vector3(0, 1, 0);
  roll = 0;
  rollVel = 0;
  turn = 0;
  dist = 0;

  private o: Required<Omit<SwimmerOpts, 'start'>>;
  private tmp = new THREE.Vector3();
  private des = new THREE.Vector3();
  private basis: BasisSmoother;

  constructor(opts: SwimmerOpts = {}) {
    this.o = {
      turnK: opts.turnK ?? 1.0,
      avMax: opts.avMax ?? 1.2,
      bound: opts.bound ?? 2.7,
      vMax: opts.vMax ?? 2.5,
      rollK: opts.rollK ?? 1.2,
      rollMax: opts.rollMax ?? 0.8,
      drag: opts.drag ?? 0.45,
      pitchMax: opts.pitchMax ?? 0.72,
    };
    this.head = new THREE.Vector3(...(opts.start ?? [-1.3, 0, 0]));
    this.basis = new BasisSmoother(this.dir);
  }

  steer(target: THREE.Vector3, dt: number): void {
    this.des.copy(target).sub(this.head);
    this.dist = this.des.length();
    if (this.dist > 0.001) this.des.normalize();
    // Anti-parallel stall guard: with the target behind, (des − dir) is
    // collinear with the body axis — zero turning torque, the fish never
    // comes about (the old instant mirror-flip used to mask this). Bias the
    // aim sideways along the horizontal perpendicular so reversals become a
    // definite yaw arc, like a real fish.
    const behind = this.des.dot(this.dir);
    if (behind < -0.35) {
      const px = -this.dir.z, pz = this.dir.x; // worldUp × dir (horizontal)
      const sgn = this.des.x * px + this.des.z * pz >= 0 ? 1 : -1;
      const w = (-behind - 0.35) * 1.8;
      this.des.x += px * sgn * w;
      this.des.z += pz * sgn * w;
      this.des.normalize();
    }
    const want = Math.min(1, this.dist / 1.5);
    this.tmp.copy(this.des).sub(this.dir);
    this.dirVel.addScaledVector(this.tmp, this.o.turnK * this.kTurn * want * dt);
    this.dirVel.multiplyScalar(Math.pow(0.3, dt));
    const av = this.dirVel.length();
    const avCap = this.o.avMax * this.kTurn;
    if (av > avCap) this.dirVel.multiplyScalar(avCap / av);
    this.dir.addScaledVector(this.dirVel, dt).normalize();
    // pitch clamp — fish never point at the vertical pole (basis stays sane,
    // and real fish don't nose-dive vertically anyway)
    if (Math.abs(this.dir.y) > this.o.pitchMax) {
      this.dir.y = Math.sign(this.dir.y) * this.o.pitchMax;
      this.dir.normalize();
    }

    // basis without roll — continuity-stabilized (no pole mirror-flips)
    this.side.copy(this.basis.update(this.dir, dt));
    this.up.crossVectors(this.dir, this.side).normalize();

    // bank into the turn (spring)
    this.turn = this.dirVel.dot(this.side);
    const rollTarget = THREE.MathUtils.clamp(-this.turn * this.o.rollK, -this.o.rollMax, this.o.rollMax);
    this.rollVel += (rollTarget - this.roll) * 3.5 * dt;
    this.rollVel *= Math.pow(0.12, dt);
    this.roll += this.rollVel * dt * 3;
    const cr = Math.cos(this.roll);
    const sr = Math.sin(this.roll);
    this.sideR.copy(this.side).multiplyScalar(cr).addScaledVector(this.up, sr);
    this.upR.copy(this.up).multiplyScalar(cr).addScaledVector(this.side, -sr);
  }

  move(thrust: number, dt: number): void {
    this.vel.addScaledVector(this.dir, thrust * this.kSpeed * dt * 2.2);
    this.vel.multiplyScalar(Math.pow(this.o.drag, dt));
    const off = this.head.length();
    if (off > this.o.bound) {
      this.tmp.copy(this.head).multiplyScalar(-1 / off);
      this.vel.addScaledVector(this.tmp, (off - this.o.bound) * 2.0 * dt);
    }
    const sp = this.vel.length();
    const vCap = this.o.vMax * this.kSpeed;
    if (sp > vCap) this.vel.multiplyScalar(vCap / sp);
    if (!Number.isFinite(this.head.x + this.vel.x + this.dir.x)) {
      this.head.set(0, 0, 0);
      this.vel.set(0.3, 0, 0);
      this.dir.set(1, 0, 0);
      this.dirVel.set(0, 0, 0);
    }
    this.head.addScaledVector(this.vel, dt);
  }
}

export interface DriveOpts {
  sBase?: number; // cruise thrust
  sGain?: number; // thrust gain with chase distance
  fBase?: number; // gait frequency base (Hz)
  fGain?: number; // frequency gain with chase
  thrK?: number; // extra thrust multiplier
  pulse?: number; // 0..1 — thrust modulated by gait (row/pulse swimmers)
  strikeRange?: number;
  strikeBoost?: number;
  strikeCd?: number;
  /**
   * Distance at which arrival deceleration starts. Must be well beyond the
   * swimmer's natural turning radius (vMax/avMax) — a slow-turning species
   * (mola mola: avMax 0.45, vMax 0.8 ⇒ radius ≈1.8) that only starts slowing
   * at that same distance never breaks out of a stable circling orbit around
   * the target (it needs to already be slower BY the time it reaches its own
   * turn radius, not just starting to brake there). Default matches the
   * original single hardcoded value for every other species.
   */
  slowR?: number;
}

/** Chase gait: distance→frenzy, phase accumulator, lunge-strike with cooldown. */
export class Drive {
  /** Live gait-frequency multiplier (lab «Behavior»; 1 = authored fBase/fGain). */
  kFreq = 1;
  ph = Math.random();
  speed = 0.5;
  strike = 0;
  frenzy = 0;
  dist = 0;

  private sw: Swimmer;
  private o: Required<DriveOpts>;
  private strikeT = -10;
  private armed = true;

  constructor(sw: Swimmer, opts: DriveOpts = {}) {
    this.sw = sw;
    this.o = {
      sBase: opts.sBase ?? 0.5,
      sGain: opts.sGain ?? 1.0,
      fBase: opts.fBase ?? 0.8,
      fGain: opts.fGain ?? 0.7,
      thrK: opts.thrK ?? 1.0,
      pulse: opts.pulse ?? 0,
      strikeRange: opts.strikeRange ?? 1.5,
      strikeBoost: opts.strikeBoost ?? 2.0,
      strikeCd: opts.strikeCd ?? 1.4,
      slowR: opts.slowR ?? 2.2,
    };
  }

  update(cursor: THREE.Vector3, dt: number, time: number): void {
    const sw = this.sw;
    sw.steer(cursor, dt);
    this.dist = sw.dist;
    this.frenzy = Math.min(1, this.dist / 2.5);

    if (this.dist > this.o.strikeRange * 1.2) this.armed = true;
    const facing =
      this.dist > 0.001 &&
      (cursor.x - sw.head.x) * sw.dir.x + (cursor.y - sw.head.y) * sw.dir.y + (cursor.z - sw.head.z) * sw.dir.z >
        this.dist * 0.75;
    if (this.armed && this.dist < this.o.strikeRange && time - this.strikeT > this.o.strikeCd && facing) {
      this.strikeT = time;
      this.armed = false;
    }
    this.strike = Math.max(0, 1 - (time - this.strikeT) / 0.45);

    this.ph += (this.o.fBase + this.o.fGain * this.frenzy + this.strike * 0.8) * this.kFreq * dt;
    const gate = this.o.pulse > 0 ? 1 - this.o.pulse + this.o.pulse * Math.max(0, Math.sin(this.ph * Math.PI * 2)) : 1;
    // decelerate on final approach — otherwise equilibrium speed keeps the
    // orbit radius (v/avMax) larger than the catch sphere and the animal
    // circles its prey forever; strikes stay at full power
    const slow = Math.min(1, Math.max(0.25, this.dist / this.o.slowR));
    const spd = ((this.o.sBase + this.o.sGain * this.frenzy) * slow + this.strike * this.o.strikeBoost) * gate * this.o.thrK;
    this.speed += (spd - this.speed) * (1 - Math.pow(0.25, dt));
    sw.move(spd, dt);
    // arrival braking: cutting thrust alone leaves momentum — fast swimmers
    // shot straight through the target and looped forever. Bleed velocity
    // itself as the target nears (no-op when far, strikes excluded).
    if (this.strike < 0.05) sw.vel.multiplyScalar(Math.pow(0.22, dt * (1 - slow) * 1.6));
  }
}

/** Body of revolution along the forward axis: u=0 nose → u=1 tail. */
export function body(
  P: Particle[],
  {
    n,
    L,
    r,
    flat,
    color,
  }: {
    n: number;
    L: number;
    r: (u: number) => number;
    flat?: (u: number) => number;
    color: (u: number, a: number, rr: number) => THREE.Color;
  },
): void {
  for (let i = 0; i < n; i++) {
    const u = Math.random();
    const a = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.random());
    const R = r(u);
    P.push({
      u,
      lx0: Math.cos(a) * rr * R * (flat ? flat(u) : 1),
      ly0: (0.5 - u) * L,
      lz0: Math.sin(a) * rr * R,
      c: color(u, a, rr),
    });
  }
}

/** Fin fan: particles along a direction ray with chord spread. */
export function fin(
  P: Particle[],
  {
    n,
    u,
    base,
    du,
    dv,
    len,
    chord,
    color,
    extra,
  }: {
    n: number;
    u: number;
    base: [number, number, number];
    du: [number, number, number];
    dv: [number, number, number];
    len: number;
    chord: (s: number) => number;
    color: (s: number, w: number) => THREE.Color;
    extra?: Record<string, unknown>;
  },
): void {
  const dl = Math.hypot(du[0], du[1], du[2]) || 1;
  for (let i = 0; i < n; i++) {
    const s = Math.random();
    const w = Math.random() * 2 - 1;
    const ch = chord(s);
    P.push({
      u,
      s,
      w,
      lx0: base[0] + (du[0] / dl) * s * len + dv[0] * w * ch,
      ly0: base[1] + (du[1] / dl) * s * len + dv[1] * w * ch,
      lz0: base[2] + (du[2] / dl) * s * len + dv[2] * w * ch,
      c: color(s, w),
      ...(extra ?? {}),
    });
  }
}

/**
 * Standard undulation layout: base local offsets + a travelling bend wave
 * growing from `start` toward the tail, then place() into world space.
 * axis 'x' = lateral wave (fish/sharks), 'z' = vertical (cetaceans).
 */
export function layoutWave(
  pts: PointCloud,
  P: Particle[],
  sw: Swimmer,
  {
    ph,
    amp,
    kw,
    axis,
    start,
    pw,
    ctx,
    extraFn,
    sx = 1,
    sy = 1,
    sz = 1,
  }: {
    ph: number;
    amp: number;
    kw: number;
    axis: 'x' | 'z';
    start: number;
    pw: number;
    ctx?: number;
    extraFn?: (p: Particle, v: [number, number, number], ctx?: number) => void;
    /**
     * Body-proportion multipliers («Proportions» knobs): sx — width (side),
     * sy — length (forward), sz — thickness (up). Applied AFTER extraFn so
     * appendage/jaw offsets scale with the body and nothing detaches.
     */
    sx?: number;
    sy?: number;
    sz?: number;
  },
): void {
  const pos = pts.pos;
  const v: [number, number, number] = [0, 0, 0];
  const scaled = sx !== 1 || sy !== 1 || sz !== 1;
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    v[0] = (p.lx0 as number) ?? 0;
    v[1] = (p.ly0 as number) ?? 0;
    v[2] = (p.lz0 as number) ?? 0;
    const u = (p.u as number) ?? 0.5;
    const q = Math.max(0, (u - start) / (1 - start));
    const disp = Math.sin(ph * Math.PI * 2 - u * kw) * amp * Math.pow(q, pw);
    if (axis === 'x') v[0] += disp;
    else v[2] += disp;
    extraFn?.(p, v, ctx);
    if (scaled) { v[0] *= sx; v[1] *= sy; v[2] *= sz; }
    place(pos, i, sw.head, sw.dir, sw.sideR, sw.upR, v[0], v[1], v[2]);
  }
  pts.geo.attributes.position.needsUpdate = true;
}
