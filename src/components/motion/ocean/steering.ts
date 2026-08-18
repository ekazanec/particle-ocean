/*!
 * particle-ocean · https://github.com/ekazanec/particle-ocean
 * Copyright (c) 2026 Andrey Gurov · https://agurov.com
 * MIT licensed. If you ship something built on this, a link back is appreciated.
 */
/**
 * Invisible art direction for the hero creature: `autonomy + soft constraint`,
 * never scripted motion (external UX review, 2026-08-06; accepted in
 * SecondBrain/Design/2026-08-06-hero-ux-recommendations-assessment.md).
 *
 * Two soft fields shape the creature's TARGET (never its position — the
 * swimmer's own inertia/turn spring stays the only thing that moves the body,
 * so the return always looks like the creature's own decision):
 *
 * 1. ATTRACT — each slide has a preferred visible region (fractions of the
 *    visible frustum). The creature roams freely; only after it has spent
 *    `grace` seconds with its head outside the region does a bias start
 *    ramping in over `ramp` seconds, pulling the chase target toward the
 *    region. Re-entering releases the bias over `release` seconds. No
 *    teleports, no hard walls — the existing 1.18× frustum margin clamp in
 *    ocean-hero.tsx stays the outermost safety net.
 *
 * 2. REPEL — soft force fields around critical UI (CTA buttons, the slide
 *    rail, the header bar). Zones are DOM rects projected into world space;
 *    repulsion is zero beyond ~1 influence radius, quadratic on approach —
 *    weak far away, firm near the control, no abrupt direction changes.
 *
 * Both fields apply ONLY while the creature swims autonomously (cursor idle
 * or touch device). Active pointer chase overrides everything: interaction
 * is the emergent-personality layer, the fields are the base composition.
 *
 * Zero allocations per frame. Telemetry via getTelemetry() → __ocDbg.steer;
 * `window.__ocSteerOff = true` is the harness escape (same inert family as
 * __ocFloraOff / __ocActorHide) for A/B measurement.
 */
import * as THREE from 'three';

/** Preferred region in fractions of the visible half-extents (camera frustum
 *  at z=0): cx/cy = center offset, rx/ry = half-size. {cx:0, cy:0, rx:1, ry:1}
 *  would be the whole visible viewport. */
export interface SteerRegion {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** UI avoidance zone — a viewport-pixel rect (from getBoundingClientRect). */
export interface SteerZone {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SteeringTuning {
  /** Seconds outside the region before any bias appears. */
  grace: number;
  /** Seconds from first bias to full strength (the longer outside, the stronger). */
  ramp: number;
  /** Seconds to fade the bias out after re-entry. */
  release: number;
  /** Max fraction of the target pulled toward the region (1 = hard override). */
  maxBias: number;
  /**
   * Constant baseline pull toward the region whenever the creature swims
   * autonomously (cursor idle / touch) — the "base state is art-directed"
   * rule: a stale pointer parked at a screen corner must not keep dragging
   * the composition off-frame between outside-ramp cycles.
   */
  idleBias: number;
  /** Repulsion influence radius in world units beyond the zone's own rect. */
  repelRadius: number;
}

export const STEER_DEFAULTS: SteeringTuning = {
  grace: 2.5,
  ramp: 4.5,
  release: 2,
  // full override at max ramp: after ~7s outside, the target IS inside the
  // region — the swimmer's inertia still supplies all the naturalness; a
  // partial cap left the creature oscillating at the boundary (A/B measured
  // 38.6% off-frame with 0.85 vs 97.8% unsteered).
  maxBias: 1,
  idleBias: 0.35,
  repelRadius: 1.4,
};

/**
 * Default preferred regions. The composition splits: hero copy owns the
 * lower-left on desktop (lower half on mobile), so the creature's strong
 * area leans right-of-center on desktop and to the upper half on touch.
 * Per-species overrides art-direct individual slides where the default
 * reads wrong (none needed yet — the table is the extension point).
 */
const REGION_DESKTOP: SteerRegion = { cx: 0.16, cy: 0.04, rx: 0.62, ry: 0.6 };
const REGION_TOUCH: SteerRegion = { cx: 0, cy: 0.3, rx: 0.68, ry: 0.48 };
const REGION_BY_SPECIES: Record<string, Partial<SteerRegion>> = {};

export function regionFor(speciesId: string, isTouch: boolean): SteerRegion {
  const base = isTouch ? REGION_TOUCH : REGION_DESKTOP;
  const o = REGION_BY_SPECIES[speciesId];
  return o ? { ...base, ...o } : base;
}

export interface SteerTelemetry {
  /** Visible half-extents (world units) seen at the last shape() call. */
  half: { w: number; h: number };
  /** Seconds the head has currently been outside the preferred region. */
  out: number;
  /** Current attract bias strength 0..1. */
  s: number;
  /** Head inside the preferred region right now. */
  inRegion: boolean;
  /** Bias/repulsion actually applied this frame (autonomous mode + enabled). */
  applied: boolean;
  /** Number of active repulsion zones. */
  zones: number;
  /** Cumulative seconds outside region / total live seconds (measurement). */
  cumOut: number;
  cumT: number;
}

export class Steering {
  private readonly tn: SteeringTuning;
  private outsideT = 0;
  private s = 0;
  private inRegion = true;
  private appliedLast = false;
  private cumOut = 0;
  private cumT = 0;
  private zones: SteerZone[] = [];
  private lastHalf = { w: 0, h: 0 };
  private readonly push = new THREE.Vector3();

  constructor(tuning: Partial<SteeringTuning> = {}) {
    this.tn = { ...STEER_DEFAULTS, ...tuning };
  }

  setZones(zones: SteerZone[]): void {
    this.zones = zones;
  }

  /** Reset transient state (new creature spawned). Cumulative stats persist. */
  reset(): void {
    this.outsideT = 0;
    this.s = 0;
    this.inRegion = true;
  }

  /**
   * Shape `target` in place. The species chase in UNSCALED space and render
   * at head×scale (see ocean-hero.tsx dbg notes), so all region/zone tests
   * run in VISUAL space (×scale) and corrections divide back by `scale`
   * before touching the target. `half` is the visible half-extents at z=0,
   * `region` the preferred region for the current slide, `vw/vh` the
   * viewport px (zone projection). `active` = autonomous mode (cursor idle
   * or touch) — an active pointer chase applies nothing.
   */
  shape(
    target: THREE.Vector3,
    head: THREE.Vector3,
    scale: number,
    half: { w: number; h: number },
    region: SteerRegion,
    vw: number,
    vh: number,
    dt: number,
    active: boolean,
  ): void {
    const tn = this.tn;
    const rcx = region.cx * half.w;
    const rcy = region.cy * half.h;
    const rrx = region.rx * half.w;
    const rry = region.ry * half.h;
    const hx = head.x * scale;
    const hy = head.y * scale;
    this.lastHalf.w = half.w;
    this.lastHalf.h = half.h;

    this.inRegion = Math.abs(hx - rcx) <= rrx && Math.abs(hy - rcy) <= rry;
    this.cumT += dt;
    if (!this.inRegion) {
      this.outsideT += dt;
      this.cumOut += dt;
    } else {
      // outside-time drains rather than snapping to zero, so a creature
      // skimming the boundary doesn't get a fresh grace period every dip —
      // and drains slowly (1×dt), or boundary flicker dissolves the bias
      // before the creature is properly back inside
      this.outsideT = Math.max(0, this.outsideT - dt);
    }

    // attract strength: ramp up past grace, ease out after re-entry
    const sWant =
      this.outsideT <= tn.grace
        ? 0
        : Math.min(1, (this.outsideT - tn.grace) / tn.ramp);
    if (sWant >= this.s) this.s = sWant;
    else this.s = Math.max(sWant, this.s - dt / tn.release);

    this.appliedLast = active;
    if (!active) return;

    // visual-space target: where the creature would visually settle if it
    // reached this chase point (render = head × scale)
    const tvx = target.x * scale;
    const tvy = target.y * scale;
    let ox = tvx;
    let oy = tvy;

    // attract point: the nearest position WELL inside the region (0.55
    // shrink) — aiming at the boundary would leave the head hovering
    // half-out; the swimmer's approach braking does the rest
    const ax = THREE.MathUtils.clamp(tvx, rcx - rrx * 0.55, rcx + rrx * 0.55);
    const ay = THREE.MathUtils.clamp(tvy, rcy - rry * 0.55, rcy + rry * 0.55);
    // baseline idle pull + outside-time ramp on top
    const k = this.s * tn.maxBias;
    const smooth = k * k * (3 - 2 * k);
    const pull = Math.min(1, tn.idleBias + (1 - tn.idleBias) * smooth);
    ox += (ax - ox) * pull;
    oy += (ay - oy) * pull;

    // repulsion: viewport rect → world rect, closest-point falloff
    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i];
      const x0 = ((z.x / vw) * 2 - 1) * half.w;
      const x1 = (((z.x + z.w) / vw) * 2 - 1) * half.w;
      const y0 = (1 - ((z.y + z.h) / vh) * 2) * half.h;
      const y1 = (1 - (z.y / vh) * 2) * half.h;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const nx = THREE.MathUtils.clamp(ox, x0, x1);
      const ny = THREE.MathUtils.clamp(oy, y0, y1);
      const dx = ox - nx;
      const dy = oy - ny;
      const d = Math.hypot(dx, dy);
      if (d >= tn.repelRadius) continue;
      // direction: away from the closest point; from the zone CENTER when
      // the target sits inside the rect (closest point == target there)
      this.push.set(d > 1e-4 ? dx / d : ox - cx, d > 1e-4 ? dy / d : oy - cy, 0);
      if (this.push.lengthSq() < 1e-6) this.push.set(0, 1, 0);
      this.push.setLength((tn.repelRadius - d) * ((tn.repelRadius - d) / tn.repelRadius));
      ox += this.push.x;
      oy += this.push.y;
    }

    // back to the swimmer's unscaled chase space
    target.x = ox / scale;
    target.y = oy / scale;
  }

  getTelemetry(): SteerTelemetry {
    const r2 = (v: number) => Math.round(v * 100) / 100;
    return {
      half: { w: r2(this.lastHalf.w), h: r2(this.lastHalf.h) },
      out: r2(this.outsideT),
      s: r2(this.s),
      inRegion: this.inRegion,
      applied: this.appliedLast,
      zones: this.zones.length,
      cumOut: r2(this.cumOut),
      cumT: r2(this.cumT),
    };
  }
}
