/**
 * OceanHero — 16-animal particle hero.
 *
 * A random animal spawns on load and chases the cursor. When it catches the
 * cursor (or on a timer for the herring school / touch devices), its particles
 * scatter outward and reassemble into the next random animal — the scatter-and-reassemble mutation that works across arbitrary particle counts.
 *
 * Reduced motion: renders one assembled static frame, no animation loop.
 * Touch: no pointer chase — the target drifts on a Lissajous path and morphs
 * fire on a timer.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  CursorTarget, applyBodyMode, applyColorGrade, attachWater, makeSpriteSet,
  type BodyModeHandle, type BodyRenderMode, type SpriteLook, type WorldCtx,
} from '@/components/motion/ocean/core';
import type { OceanParamValue } from '@/components/motion/ocean/types';
import { attachFlora, type FloraHandle, type FloraSlab, type OceanFloraId } from '@/components/motion/ocean/flora';
import { makeMorphFx, type MorphFx, type MorphVariantId } from '@/components/motion/ocean/morph';
import { OCEAN_ANIMALS } from '@/components/motion/ocean/registry';
import { Steering, regionFor, type SteerZone } from '@/components/motion/ocean/steering';
import type { OceanAnimal, OceanAnimalDef } from '@/components/motion/ocean/types';
import oceanHeroCfg from '@/config/ocean-hero';

// Default depth range (max |z| roam from the origin plane) when the author
// hasn't tuned a species in /lab/ocean — comfortably beyond every animal's
// natural Swimmer `bound` (~2.2–2.8), so the clamp is a no-op until someone
// deliberately dials it down.
export const DEFAULT_DEPTH_RANGE = 5;
export const DEFAULT_SCALE = 1;

// Catch = first touch, not a sustained hold: fast swimmers' minimum turning
// radius (vMax/avMax, e.g. dolphin ≈0.84) exceeds catchR, so they can only
// pass THROUGH the catch sphere on a strike — a hold requirement made them
// uncatchable in practice.
const CATCH_HOLD = 0.02;
const MIN_DWELL = 8; // s before a new morph can trigger
const TIMER_MORPH = 45; // s — herring school / fallback
const TOUCH_MORPH = 26; // s — touch devices
const SCATTER_T = 0.7;
const ASSEMBLE_T = 1.3;
// First-load overture (owner's ask 2026-08-06, shipped with the Coherence
// narrative): the very first creature assembles slower and from a much wider
// scatter, so slide 1 «Complexity starts scattered» is literally true on
// screen — raw particles drift in and organize into the organism. Subsequent
// spawns keep the quick ASSEMBLE_T (morphs have their own choreography).
const INTRO_ASSEMBLE_T = 2.8;
const INTRO_SCATTER_R = 2.4; // multiplier on the assemble-shell radius
// Off-screen catch-up: sim-time multiplier while the creature is outside the
// visible frustum (owner's ask 2026-08-06 — get back in frame fast).
const OFFSCREEN_BOOST = 4;
// Heading-inheritance warm-start for in-place morph variants: the freshly
// spawned swimmer chases a carrot along the OLD creature's course for ~7
// simulated seconds (one-time trigger cost, fully covered by the ghost), so
// its body axis matches the inherited heading instead of the species-default
// +x. 7s covers ≥ 2.2 rad even for the slowest turner (mola-mola avMax 0.45).
const PREROLL_STEPS = 140;
const PREROLL_DT = 0.05;
// Slide mode pacing: don't advance while the visitor is exploring. Only
// switch once the mouse has been still for IDLE_ADVANCE_SEC, OR — if they're
// actively moving the mouse ("playing" with the creature) — the instant it
// actually catches the cursor, whichever comes first.
const IDLE_ADVANCE_SEC = 12;
const MOVE_IDLE_GAP = 0.4; // s since last pointermove to still count as "moving"

// Half-extent of the camera's visible frustum at the z=0 plane (where the
// cursor target and every animal's `head` live), so both the cursor-reach
// clamp and the on-screen position clamp below scale with the actual
// viewport aspect/camera distance instead of a fixed world-unit guess — a
// fixed guess is either too tight on wide viewports (cursor "invisible" past
// a small central circle) or lets animals wander past the frame on narrow
// ones. Same formula as SeaFloorFooter's visibleHalfWidth.
function visibleHalfExtent(camera: THREE.PerspectiveCamera): { w: number; h: number } {
  const h = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
  return { w: h * camera.aspect, h };
}

interface OceanHeroProps {
  onAnimalChange?: (animalId: string) => void;
  /** /lab only: force a specific animal + expose a morph trigger. */
  forceId?: string;
  morphSignal?: number;
  /**
   * Slide mode: a fixed animal sequence driven by `slideIndex`. Morphs fire
   * on a slide-index change (bullet click) or via the idle/catch pacing
   * above — never on the old catch/timer triggers used in random mode.
   */
  slideIds?: string[];
  slideIndex?: number;
  /** Slide mode only: ask the parent to advance to the next slide. */
  onAdvance?: () => void;
  /**
   * /lab only: live tuning overrides for the current animal, applied every
   * frame (not just at spawn) so dragging a slider previews instantly.
   * Falls back to the committed ocean-hero.json value, then the engine
   * default, when unset.
   */
  liveDepthRange?: number;
  liveScale?: number;
  /**
   * /lab only: live catch-radius override (world units) — the distance at
   * which the creature counts as having caught the cursor. Falls back to
   * ocean-hero.json `catchR`, then the registry default, when unset.
   */
  liveCatchR?: number;
  /**
   * /lab only: live camera z-distance override for the current species.
   * Falls back to ocean-hero.json `camZ`, then registry `cam[2]`, when
   * unset. Applied every frame (camera lerps toward it), so dragging the
   * slider previews instantly.
   */
  liveCamZ?: number;
  /**
   * /lab only: live behavior-param overrides (key → value) copied into the
   * current animal's `p` every frame — dragging a «Behavior» slider
   * previews instantly. Keys the species doesn't declare are ignored.
   * `[min, max]` values (range mode on speed/turn) resolve to a smoothly
   * wandering effective number before reaching the species.
   * Production path: saved ocean-hero.json `params` applied at spawn
   * (numbers once; ranges re-resolved every frame).
   */
  liveParams?: Record<string, OceanParamValue>;
  /**
   * /lab only: pointer is over the tuning panel — ignore the real cursor
   * and let the creature idly patrol the visible center of the screen so
   * it never hides behind the panel while knobs are being dragged.
   */
  parkAtCenter?: boolean;
  /**
   * /lab only: suppress the random-mode catch/timer auto-morph so the
   * picked animal stays put while tuning UI is used — reaching for a
   * slider/select still moves the mouse across the canvas, and after
   * MIN_DWELL the animal would otherwise "catch" that cursor and morph
   * into a random other animal, which reads as the wrong control changing
   * the animal. Morph → (morphSignal) still works explicitly.
   */
  disableAutoMorph?: boolean;
  /**
   * /lab only: live-preview a morph choreography. Falls back to the
   * committed ocean-hero.json `morphVariant`, then 'legacy' (the shipped
   * scatter→origin-assemble behavior), when unset — so the Hero keeps its
   * current look until a variant is deliberately saved to the config.
   */
  liveMorphVariant?: MorphVariantId;
  /**
   * /lab only: body density render mode preview, applied live to the current
   * animal's cloud (see core.ts applyBodyMode). 'glow' — the shipped
   * additive look — is the default everywhere; there is deliberately no
   * config plumbing yet, a winner gets promoted once picked visually.
   */
  liveBodyMode?: BodyRenderMode;
  /**
   * In-scene flora biome paired with the page's backdrop selection (see
   * flora.ts BG_FLORA — five seafloor biomes since the 2026-07-30 redo).
   * Real depth-writing geometry INSIDE the creature scene: elements span
   * z-bands behind AND in front of the creature's roam volume, and every
   * creature pass depth-tests against them — occlusion is per-fragment,
   * never a fake 2D overlay. Each biome owns its motion character — there
   * is no separate sway selector anymore, the biome IS the design.
   * null/undefined = no flora (the production Hero today).
   */
  sceneFlora?: OceanFloraId | null;
}

export function OceanHero({
  onAnimalChange, forceId, morphSignal, slideIds, slideIndex, onAdvance, liveDepthRange, liveScale,
  liveCatchR, liveCamZ, liveParams, disableAutoMorph, liveMorphVariant, liveBodyMode, parkAtCenter,
  sceneFlora,
}: OceanHeroProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const cbRef = useRef<typeof onAnimalChange>(onAnimalChange);
  cbRef.current = onAnimalChange;
  const advRef = useRef<typeof onAdvance>(onAdvance);
  advRef.current = onAdvance;
  const morphReq = useRef(0);
  const slideReq = useRef(slideIndex ?? 0);
  slideReq.current = slideIndex ?? 0;
  const liveDepthRef = useRef(liveDepthRange);
  liveDepthRef.current = liveDepthRange;
  const liveScaleRef = useRef(liveScale);
  liveScaleRef.current = liveScale;
  const liveCatchRef = useRef(liveCatchR);
  liveCatchRef.current = liveCatchR;
  const liveCamZRef = useRef(liveCamZ);
  liveCamZRef.current = liveCamZ;
  const liveParamsRef = useRef(liveParams);
  liveParamsRef.current = liveParams;
  const liveMorphRef = useRef(liveMorphVariant);
  liveMorphRef.current = liveMorphVariant;
  const liveBodyRef = useRef(liveBodyMode);
  liveBodyRef.current = liveBodyMode;
  const parkRef = useRef(parkAtCenter);
  parkRef.current = parkAtCenter;
  const floraRef = useRef(sceneFlora);
  floraRef.current = sceneFlora;
  // Reduced-motion path has no frame loop, so a sceneFlora change would
  // otherwise never mount/unmount the elements — the engine effect installs
  // a poke here that re-syncs and re-renders the single static frame.
  const floraPokeRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    floraPokeRef.current?.();
  }, [sceneFlora]);

  useEffect(() => {
    if (morphSignal !== undefined && morphSignal > 0) morphReq.current = morphSignal;
  }, [morphSignal]);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isTouch =
      window.matchMedia('(hover: none)').matches ||
      window.matchMedia('(pointer: coarse)').matches ||
      window.innerWidth < 768;

    // Decoration must never take down the page: WebGL may be unavailable
    // (GPU-blocklisted browsers, battery saver, headless) — bail to no scene.
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x07090f, 0.045);
    const camera = new THREE.PerspectiveCamera(55, el.clientWidth / Math.max(1, el.clientHeight), 0.1, 100);
    // sprite family for the «Glow»/«Particle size» knobs; `.base` is the
    // untouched stock sprite, so every consumer of world.sprite is unchanged
    const sprites = makeSpriteSet();
    const world: WorldCtx = { scene, camera, sprite: sprites.base };
    const water = attachWater(world);

    // In-scene flora (sceneFlora prop): mounted/unmounted lazily so a /lab
    // background switch swaps it without restarting the engine. The
    // `__ocFloraOff` escape lets the verification harness A/B fps with and
    // without the flora in the SAME session (same debug-hook family as
    // __ocDbg / __ocSpriteImg — tiny and inert in production).
    let flora: FloraHandle | null = null;
    const floraWant = (): OceanFloraId | null =>
      (window as unknown as { __ocFloraOff?: boolean }).__ocFloraOff
        ? null
        : floraRef.current ?? null;
    // Harness escape (same inert debug family as __ocFloraOff): treat the
    // creature as REMOVED from the scene — its points hidden below AND its
    // z-slab withheld from the flora resolve. Needed to prove the blades'
    // own motion ignores the cursor by pixel identity: the creature
    // legitimately chases the cursor, and even an invisible one would keep
    // flipping blades across its slab (fog-depth shade changes — the
    // accepted occlusion machinery, not sway). Never set in production.
    const actorHide = (): boolean =>
      !!(window as unknown as { __ocActorHide?: boolean }).__ocActorHide;
    // Harness escape for the steering A/B (measure time-in-region with the
    // invisible art direction off). `?nosteer=1` is the human-eyes variant of
    // the same switch — open the hero with and without the invisible art
    // direction side by side. Never used in production content.
    const steerOffQS =
      typeof location !== 'undefined' && /[?&]nosteer=/.test(location.search);
    const steerOff = (): boolean =>
      steerOffQS || !!(window as unknown as { __ocSteerOff?: boolean }).__ocSteerOff;

    // ---- invisible art direction (slide mode only, see steering.ts) ----
    // Attract: per-slide preferred region. Repel: soft fields around the
    // hero's interactive UI. Zone rects are DOM measurements refreshed on
    // resize + a slow timer (layout shifts, slide CTA changes) — never per
    // frame.
    const steering = new Steering();
    const steerMount = el; // non-null alias (fn declarations don't keep the narrow)
    const steerZoneEls: Element[] = [];
    function collectZoneEls(): void {
      steerZoneEls.length = 0;
      if (!slideIds) return;
      const section = steerMount.closest('section') ?? document;
      steerZoneEls.push(
        ...section.querySelectorAll('.ds-btn'),
        ...section.querySelectorAll('[role="tablist"][aria-label="Hero slides"]'),
        ...document.querySelectorAll('.ds-nav-bar'),
      );
    }
    const steerZones: SteerZone[] = [];
    function measureZones(): void {
      if (!slideIds) return;
      if (!steerZoneEls.length) collectZoneEls();
      steerZones.length = 0;
      for (const zel of steerZoneEls) {
        const r = zel.getBoundingClientRect();
        // ignore rects outside the hero viewport (scrolled away / collapsed)
        if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight) continue;
        steerZones.push({ x: r.left, y: r.top, w: r.width, h: r.height });
      }
      steering.setZones(steerZones);
    }
    measureZones();
    const zoneTimer = slideIds ? window.setInterval(measureZones, 2500) : 0;
    if (slideIds) addEventListener('resize', measureZones);
    function syncFlora(): void {
      const want = floraWant();
      if ((flora?.id ?? null) === want) return;
      flora?.dispose();
      flora = want ? attachFlora(world, want) : null;
    }
    syncFlora(); // reduced-motion path renders once below — attach up front

    // Creature-occupied z-slab (render space) for the flora's whole-creature
    // binary occlusion: min/max particle z (stride-sampled — the 0.35 margin
    // covers skipped particles) of the live animal, the legacy scatter ghost
    // and a bracket around an in-place morph fx anchor. One creature must
    // read as ONE object: no blade may cut it partially.
    function creatureSlab(): FloraSlab | null {
      let mn = Infinity;
      let mx = -Infinity;
      let size: number | undefined;
      if (animal) {
        const pos = animal.cloud.pos;
        const s = animal.cloud.points.scale.x;
        let sx = 0, sy = 0, sz = 0, qx = 0, qy = 0, qz = 0, n = 0;
        for (let i = 2; i < animal.cloud.N * 3; i += 12) {
          const vx = pos[i - 2];
          const vy = pos[i - 1];
          const v = pos[i];
          sx += vx; qx += vx * vx;
          sy += vy; qy += vy * vy;
          sz += v; qz += v * v;
          n++;
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
        if (mn !== Infinity && n > 0) {
          // Actor size for the kelp proportion factor: 4σ of the DENSE mass
          // along the widest axis (min/max extent is inflated by sparse
          // outliers — a jellyfish's thin tentacle plume out-measured a
          // whale shark's solid body; σ orders them honestly). Herring
          // school = its school spread, automatically.
          const vMax = Math.max(
            qx / n - (sx / n) * (sx / n),
            qy / n - (sy / n) * (sy / n),
            qz / n - (sz / n) * (sz / n),
          );
          // ×(camZ/8): species cameras NORMALIZE screen size (whale shark is
          // framed from 10.5, lionfish from 7.5) — folding the authored
          // camera distance back in recovers the semantic size ordering
          // (whale > turtle > jellyfish) that raw world extents lose
          size = 4 * Math.sqrt(Math.max(vMax, 0)) * s * (camZNow() / 8);
          mn *= s;
          mx *= s;
        }
      }
      if (ghost) {
        const arr = ghost.geo.getAttribute('position').array as Float32Array;
        const gs = ghost.points.scale.z;
        for (let i = 2; i < ghost.N * 3; i += 12) {
          const v = arr[i] * gs;
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
      }
      if (fx) {
        mn = Math.min(mn, fx.anchor.z - 1.6);
        mx = Math.max(mx, fx.anchor.z + 1.6);
      }
      if (mn === Infinity) return null;
      return { lo: mn - 0.35, hi: mx + 0.35, size };
    }

    const cursor = new CursorTarget();
    let lastMoveElapsed = -Infinity; // idle timer starts counting from mount
    const onPointer = (e: PointerEvent) => {
      cursor.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      lastMoveElapsed = elapsed;
    };
    if (!isTouch) addEventListener('pointermove', onPointer);

    // ---- animal lifecycle ----
    // slide mode: fixed sequence indexed by slideReq; otherwise random start
    const slideDefIdx = (s: number): number => {
      const sid = slideIds?.[Math.max(0, Math.min(s, (slideIds?.length ?? 1) - 1))];
      return Math.max(0, OCEAN_ANIMALS.findIndex((d) => d.id === sid));
    };
    let appliedSlide = slideReq.current;
    let pendingIdx: number | null = null;
    let defIdx = slideIds ? slideDefIdx(appliedSlide) : Math.floor(Math.random() * OCEAN_ANIMALS.length);
    if (forceId) {
      const fi = OCEAN_ANIMALS.findIndex((d) => d.id === forceId);
      if (fi >= 0) defIdx = fi;
    }
    let def: OceanAnimalDef = OCEAN_ANIMALS[defIdx];
    let animal: OceanAnimal | null = null;
    let baseOpacity = 0.85;
    const camTarget = new THREE.Vector3(...def.cam);
    camera.position.copy(camTarget).setZ(camTarget.z * (isTouch ? 1.3 : 1));

    // transition state
    let phase: 'assemble' | 'live' | 'scatter' = 'assemble';
    let phaseT = 0;
    let introSpawn = true; // first spawn of the session runs the overture
    let assembleT = ASSEMBLE_T; // per-spawn assemble duration (intro is longer)
    let offscreenBoost = 1; // smoothed 1↔OFFSCREEN_BOOST time-warp
    let dwell = 0;
    let catchT = 0;
    let scatterFrom: Float32Array | null = null;
    let scatterVel: Float32Array | null = null;
    let assembleFrom: Float32Array | null = null;
    let lastMorphReq = morphReq.current;
    let idleAccum = 0; // slide mode: s since the mouse was last moving
    let advanceRequested = false; // slide mode: onAdvance already asked for this slide

    // in-place morph variants (see morph.ts); 'legacy' keeps the shipped path
    const variantNow = (): MorphVariantId => liveMorphRef.current ?? oceanHeroCfg.morphVariant ?? 'legacy';
    const scaleFor = (id: string): number => liveScaleRef.current ?? oceanHeroCfg.animals[id]?.scale ?? DEFAULT_SCALE;
    // Effective catch radius / camera z for the CURRENT species: /lab live
    // override → saved ocean-hero.json tuning → registry default. Same
    // resolution order as depth/scale, so prod picks up a committed value
    // with no code change and old configs (fields absent) are untouched.
    const catchRNow = (): number =>
      liveCatchRef.current ?? oceanHeroCfg.animals[def.id]?.catchR ?? def.catchR ?? 0.5;
    const camZNow = (): number => liveCamZRef.current ?? oceanHeroCfg.animals[def.id]?.camZ ?? def.cam[2];
    let fx: MorphFx | null = null;
    let fxVariant: MorphVariantId = 'legacy'; // variant captured at trigger time
    // body density render mode (see core.ts): applied lazily in the frame
    // loop so a select change re-styles the LIVE cloud without a respawn,
    // and re-applied automatically to each freshly spawned animal
    let bodyFx: BodyModeHandle | null = null;
    const bodyModeNow = (): BodyRenderMode => liveBodyRef.current ?? 'glow';
    function dropBodyFx(): void {
      bodyFx?.dispose();
      bodyFx = null;
    }

    // ---- range-mode wander (speed/turn saved as [min, max]) ----
    // The effective multiplier retargets every 3–8 s and smoothsteps between
    // targets — a slow, visible drift, never per-frame jitter. State is per
    // animal instance (reset at spawn), zero allocations in the frame loop.
    interface WanderState { from: number; to: number; t: number; dur: number; min: number; max: number }
    let wander: Record<string, WanderState> = {};
    // ranges that came from the SAVED config (production path) — re-resolved
    // every frame; /lab liveParams ranges take precedence when present
    let savedRanges: Record<string, [number, number]> = {};
    function resolveRange(k: string, min: number, max: number, dt: number): number {
      let w = wander[k];
      if (!w || w.min !== min || w.max !== max) {
        const start = min + Math.random() * (max - min);
        w = { from: start, to: min + Math.random() * (max - min), t: 0, dur: 3 + Math.random() * 5, min, max };
        wander[k] = w;
      }
      w.t += dt;
      if (w.t >= w.dur) {
        w.from = w.to;
        w.to = min + Math.random() * (max - min);
        w.t = 0;
        w.dur = 3 + Math.random() * 5;
      }
      const x = w.t / w.dur;
      const s = x * x * (3 - 2 * x);
      return w.from + (w.to - w.from) * s;
    }

    // ---- particle look (size / hue / sat / bright params) ----
    // stockSize: the species' authored PointsMaterial size; origCol: pristine
    // color bytes captured once per spawn. Both are the base the knobs
    // transform from — body-mode multipliers compose ON TOP (the mode handle
    // is dropped before the base changes and lazily re-applied after, so
    // opaque/core-glow size boosts and sphere color bakes stay correct).
    let stockSize = 0.065;
    let origCol: Float32Array | null = null;
    // current sprite selection («Glow» texture level + size hardening);
    // null = stock sprite untouched — passed to applyBodyMode for alphaTest
    // calibration against the ACTUAL alpha profile being rendered
    let look: SpriteLook | null = null;
    const appliedLook = { size: 1, glow: 1, hue: 0, sat: 1, bright: 1 };
    function syncLook(): void {
      if (!animal || !origCol) return;
      const ap = animal.p;
      const size = ap?.particleSize ?? 1;
      const glow = ap?.glow ?? 1;
      const hue = ap?.hue ?? 0;
      const sat = ap?.sat ?? 1;
      const bright = ap?.bright ?? 1;
      const colorChanged = hue !== appliedLook.hue || sat !== appliedLook.sat || bright !== appliedLook.bright;
      const spriteChanged = size !== appliedLook.size || glow !== appliedLook.glow;
      if (!spriteChanged && !colorChanged) return;
      dropBodyFx(); // release mode multipliers/bakes before touching the base
      if (spriteChanged) {
        // «Glow» swaps the sprite falloff texture; «Particle size»
        // scales the sprite AND (via hardening baked into the texture)
        // keeps big particles reading as dots, not halos. Texture changes
        // happen only when a knob crosses a cached level — never per frame.
        look = sprites.lookFor(glow, size);
        animal.cloud.mat.map = look.tex;
        animal.cloud.mat.size = stockSize * size * look.sf;
        animal.cloud.mat.needsUpdate = true;
      }
      if (colorChanged) applyColorGrade(animal.cloud, origCol, hue, sat, bright);
      appliedLook.size = size;
      appliedLook.glow = glow;
      appliedLook.hue = hue;
      appliedLook.sat = sat;
      appliedLook.bright = bright;
    }
    // smoothed head velocity — captured at morph trigger so the transition
    // can keep drifting on the creature's current heading (no dead stop)
    const prevHead = new THREE.Vector3();
    const headVel = new THREE.Vector3();
    const instVel = new THREE.Vector3();
    let prevHeadValid = false;
    // last morph telemetry for the /lab harness: world-space position of the
    // creature at trigger vs. the freshly spawned head — the in-place check
    // is measured, not eyeballed
    let lastMorph: {
      v: MorphVariantId; from: number[]; to: number[]; d: number;
      /** head-to-head world distance (== d; explicit for the in-place check) */
      hh: number;
      /** heading angle delta old→new in degrees (null when unmeasurable) */
      ang: number | null;
      /** old creature's unit heading at trigger (world) — for diagnostics */
      h: number[] | null;
    } | null = null;
    const morphFromWorld = new THREE.Vector3();
    const preTarget = new THREE.Vector3();
    const headingNew = new THREE.Vector3();

    function spawn(idx: number): void {
      def = OCEAN_ANIMALS[idx];
      animal = def.make(world);
      // Saved behavior tuning (ocean-hero.json `params`) applied once at
      // spawn — this is the whole production path. Keys the species doesn't
      // declare are skipped, so stale configs can't inject junk. /lab's
      // liveParams (below, per-frame) then override on top.
      const savedP = oceanHeroCfg.animals[def.id]?.params;
      wander = {};
      savedRanges = {};
      if (savedP && animal.p) {
        for (const k in savedP) {
          const v = savedP[k];
          if (!(k in animal.p)) continue;
          if (typeof v === 'number' && Number.isFinite(v)) animal.p[k] = v;
          else if (Array.isArray(v) && v.length === 2 && Number.isFinite(v[0]) && Number.isFinite(v[1])) {
            // range mode: keep the bounds, resolve per frame (wander)
            savedRanges[k] = [Math.min(v[0], v[1]), Math.max(v[0], v[1])];
          }
        }
      }
      baseOpacity = animal.cloud.mat.opacity;
      // particle-look base: authored size + pristine colors for this cloud
      stockSize = animal.cloud.mat.size;
      origCol = new Float32Array(
        (animal.cloud.geo.getAttribute('color') as THREE.BufferAttribute).array as Float32Array,
      );
      appliedLook.size = 1;
      appliedLook.glow = 1;
      appliedLook.hue = 0;
      appliedLook.sat = 1;
      appliedLook.bright = 1;
      look = null; // fresh cloud spawns with the stock sprite (world.sprite)
      syncLook(); // saved size/glow/color params apply to the very first frame
      camTarget.set(def.cam[0], def.cam[1], camZNow() * (isTouch ? 1.3 : 1));
      // assemble-from: random shell around origin. The very first spawn is
      // the narrative overture — a much wider, slower gather (see
      // INTRO_ASSEMBLE_T) so the scattered state registers before the
      // organism takes shape.
      const N = animal.cloud.N;
      const introR = introSpawn ? INTRO_SCATTER_R : 1;
      assembleT = introSpawn ? INTRO_ASSEMBLE_T : ASSEMBLE_T;
      introSpawn = false;
      assembleFrom = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const a = Math.random() * Math.PI * 2;
        const b = Math.acos(Math.random() * 2 - 1);
        const r = (2.2 + Math.random() * 1.6) * introR;
        assembleFrom[i * 3] = Math.sin(b) * Math.cos(a) * r;
        assembleFrom[i * 3 + 1] = Math.cos(b) * r * 0.7;
        assembleFrom[i * 3 + 2] = Math.sin(b) * Math.sin(a) * r;
      }
      phase = 'assemble';
      phaseT = 0;
      dwell = 0;
      catchT = 0;
      prevHeadValid = false;
      headVel.set(0, 0, 0);
      steering.reset(); // new creature earns a fresh grace period
      cbRef.current?.(def.id);
    }
    spawn(defIdx);

    /** Next animal index: slide target when queued, otherwise a new random. */
    function pickNext(): number {
      if (pendingIdx !== null) {
        const next = pendingIdx;
        pendingIdx = null;
        return next;
      }
      let next = Math.floor(Math.random() * OCEAN_ANIMALS.length);
      if (OCEAN_ANIMALS.length > 1) while (next === defIdx) next = Math.floor(Math.random() * OCEAN_ANIMALS.length);
      return next;
    }

    /** Record morph telemetry once the new animal exists (world space). */
    function recordMorph(v: MorphVariantId, ang: number | null = null): void {
      if (!animal) return;
      const s = scaleFor(def.id);
      const to = [animal.head.x * s, animal.head.y * s, animal.head.z * s];
      const f = morphFromWorld;
      const d = Math.hypot(to[0] - f.x, to[1] - f.y, to[2] - f.z);
      const r2 = (x: number) => Math.round(x * 100) / 100;
      lastMorph = {
        v, from: [r2(f.x), r2(f.y), r2(f.z)], to: to.map(r2), d: r2(d),
        hh: r2(d), ang: ang === null ? null : Math.round(ang * 10) / 10,
        h: fx ? [r2(fx.heading.x), r2(fx.heading.y), r2(fx.heading.z)] : null,
      };
    }

    // scatter ghost cloud (holds the dying animal's particles)
    let ghost: { geo: THREE.BufferGeometry; mat: THREE.PointsMaterial; points: THREE.Points; N: number } | null = null;

    function beginScatter(): void {
      if (!animal) return;
      const variant = variantNow();
      morphFromWorld.copy(animal.head).multiplyScalar(animal.cloud.points.scale.x);
      if (variant !== 'legacy') {
        // in-place variant: the fx snapshots the body + anchor and owns the
        // whole choreography; the new animal spawns pinned at the anchor
        fxVariant = variant;
        fx = makeMorphFx(variant, scene, animal.cloud, animal.head, headVel);
        // AFTER the fx snapshot (its ghost clones the mode-styled material),
        // BEFORE dispose — restores the stock material + removes extra passes
        dropBodyFx();
        animal.dispose();
        animal = null;
        phase = 'scatter';
        phaseT = 0;
        return;
      }
      const src = animal.cloud;
      const N = src.N;
      scatterFrom = new Float32Array(src.pos);
      scatterVel = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const a = Math.random() * Math.PI * 2;
        const b = Math.acos(Math.random() * 2 - 1);
        const v = 1.2 + Math.random() * 2.6;
        scatterVel[i * 3] = Math.sin(b) * Math.cos(a) * v;
        scatterVel[i * 3 + 1] = Math.cos(b) * v;
        scatterVel[i * 3 + 2] = Math.sin(b) * Math.sin(a) * v;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(scatterFrom), 3));
      geo.setAttribute('color', src.geo.getAttribute('color').clone());
      const mat = src.mat.clone();
      const points = new THREE.Points(geo, mat);
      points.frustumCulled = false;
      // carry the dying animal's visual scale — without this a tuned species
      // (e.g. sea-turtle at 1.8×) visibly shrank the instant scatter began
      points.scale.copy(src.points.scale);
      scene.add(points);
      ghost = { geo, mat, points, N };
      dropBodyFx(); // ghost mat was cloned above — it keeps the mode's look
      animal.dispose();
      animal = null;
      phase = 'scatter';
      phaseT = 0;
    }

    const ease = (x: number) => x * x * (3 - 2 * x);
    const lissa = new THREE.Vector3();
    const rawCursor = new THREE.Vector3(); // unclamped point — catch detection only
    let raf = 0;
    let lastT = performance.now();
    let elapsed = 0;

    function startLoop(): void {
      if (raf) return;
      lastT = performance.now();
      raf = requestAnimationFrame(frame);
    }
    function stopLoop(): void {
      cancelAnimationFrame(raf);
      raf = 0;
    }

    function frame(): void {
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      const dt = Math.min((now - lastT) / 1000, 0.05);
      lastT = now;
      elapsed += dt;
      const time = elapsed;

      // cursor: real pointer or drifting target on touch
      let target: THREE.Vector3;
      if (isTouch) {
        lissa.set(Math.sin(time * 0.21) * 1.9, Math.sin(time * 0.13 + 1.2) * 1.1, Math.sin(time * 0.17 + 0.5) * 0.8);
        target = lissa;
        rawCursor.copy(lissa);
      } else {
        target = cursor.update(camera);
        rawCursor.copy(target);
        // Clamp the chase point to (most of) the actual visible frustum, not
        // a fixed world-unit guess — a fixed ~2.35 covers only a small
        // central ellipse on a wide hero viewport (screen edges project to
        // ±6+ world units), so the animal only ever "sees" the cursor near
        // screen center. Direction is preserved, magnitude scaled per axis.
        const half = visibleHalfExtent(camera);
        target.x = THREE.MathUtils.clamp(target.x, -half.w * 0.94, half.w * 0.94);
        target.y = THREE.MathUtils.clamp(target.y, -half.h * 0.94, half.h * 0.94);
      }
      // /lab: pointer is over the tuning panel — substitute a virtual target
      // that idly patrols the centre of the VISIBLE area (offset left of the
      // ~17rem panel), so the creature cruises mid-screen instead of hiding
      // behind the panel. The swimmer's own inertia makes the handoff smooth
      // in both directions; catch is suppressed below while parked.
      const parked = !!parkRef.current && !isTouch;
      if (parked) {
        const half = visibleHalfExtent(camera);
        const cx = -half.w * (272 / Math.max(innerWidth, 1));
        lissa.set(
          cx + Math.sin(time * 0.31) * 1.5,
          Math.sin(time * 0.23 + 1.1) * 0.9,
          Math.sin(time * 0.17 + 0.6) * 0.6,
        );
        target = lissa;
      }

      water.update(dt, time);
      syncFlora(); // prop/escape-hatch changes apply without an engine restart
      // slab from the previous frame's particle positions — the 0.35 margin
      // plus CLEAR absorb one frame of creature travel; palette target keeps
      // the flora's mood in step with the current animal (lerped inside)
      flora?.setPalette(def.bg);
      flora?.update(time, actorHide() ? null : creatureSlab());
      // camera z re-resolved every frame (like scale/depth below) so the /lab
      // slider previews live: the lerp below glides toward the new distance
      camTarget.z = camZNow() * (isTouch ? 1.3 : 1);
      camera.position.lerp(camTarget, 1 - Math.pow(0.3, dt));

      // in-place morph variant: advance the ghost choreography and spawn the
      // next animal PINNED at the captured anchor (position-pin override:
      // every species places particles relative to its live `head`, so
      // copying the anchor in relocates physics + rendering wholesale)
      if (fx) {
        fx.tick(dt);
        if (!animal && fx.time >= fx.spawnDelay) {
          defIdx = pickNext();
          spawn(defIdx);
          assembleFrom = null; // fx owns the assembly, not the origin shell
          const sNew = scaleFor(def.id);
          let angDelta: number | null = null;
          if (animal) {
            const a = animal as OceanAnimal;
            a.head.copy(fx.anchor).divideScalar(sNew);
            a.cloud.points.scale.setScalar(sNew);
            // Heading inheritance: warm-start the fresh swimmer along the old
            // creature's course (head transforms into head, direction kept —
            // the species-default +x orientation would contradict both the
            // flow correspondence and the preserved drift). Treadmill trick:
            // the head is re-pinned to the anchor after EVERY step, so only
            // the orientation integrates — a free-swimming warm-start ran
            // 10+ units out where the species' bound-spring dragged it back
            // and corrupted the resulting course.
            preTarget.copy(a.head).addScaledVector(fx.heading, 6);
            for (let k = 0; k < PREROLL_STEPS; k++) {
              a.update(preTarget, PREROLL_DT, k * PREROLL_DT);
              a.head.copy(fx.anchor).divideScalar(sNew);
            }
            // measured new heading: ONE free (un-pinned) step — after the
            // treadmill the swimmer's velocity is aligned with its body
            // axis, so the single-step displacement direction IS the course
            // (a cloud-centroid estimate is noise for body-of-revolution
            // species whose head sits at the body center)
            headingNew.copy(a.head);
            a.update(preTarget, PREROLL_DT, PREROLL_STEPS * PREROLL_DT);
            headingNew.subVectors(a.head, headingNew);
            if (headingNew.lengthSq() > 1e-8) {
              headingNew.normalize();
              angDelta =
                (Math.acos(THREE.MathUtils.clamp(headingNew.dot(fx.heading), -1, 1)) * 180) / Math.PI;
            }
            // re-pin after the measuring step: the birth stays in place
            a.head.copy(fx.anchor).divideScalar(sNew);
            fx.initAssemble(a.cloud, a.head, 1 / sNew);
          }
          recordMorph(fxVariant, angDelta);
        }
      }

      // ghost scatter
      if (ghost && scatterFrom && scatterVel) {
        phaseT += phase === 'scatter' ? dt : 0;
        const t = Math.min(1, phaseT / SCATTER_T);
        const gpos = ghost.geo.getAttribute('position') as THREE.BufferAttribute;
        const arr = gpos.array as Float32Array;
        for (let i = 0; i < ghost.N * 3; i++) arr[i] = scatterFrom[i] + scatterVel[i] * phaseT * (1 + phaseT * 0.8);
        gpos.needsUpdate = true;
        ghost.mat.opacity = (1 - ease(t)) * baseOpacity;
        if (t >= 1) {
          scene.remove(ghost.points);
          ghost.geo.dispose();
          ghost.mat.dispose();
          ghost = null;
          defIdx = pickNext();
          spawn(defIdx);
          recordMorph('legacy');
        }
      }

      if (animal) {
        // /lab live behavior overrides — tiny fixed-key loop, no allocation.
        // [min, max] values (range mode) resolve to a wandering effective
        // number; the species always sees plain numbers in `p`.
        const lp = liveParamsRef.current;
        if (lp && animal.p) {
          for (const k in lp) {
            if (!(k in animal.p)) continue;
            const v = lp[k];
            if (typeof v === 'number') animal.p[k] = v;
            else if (Array.isArray(v) && v.length === 2) {
              animal.p[k] = resolveRange(k, Math.min(v[0], v[1]), Math.max(v[0], v[1]), dt);
            }
          }
        }
        // production path: ranges committed in ocean-hero.json keep wandering
        if (animal.p) {
          for (const k in savedRanges) {
            if (lp && k in lp) continue; // /lab live override wins
            if (k in animal.p) animal.p[k] = resolveRange(k, savedRanges[k][0], savedRanges[k][1], dt);
          }
        }
        syncLook(); // particle size/color params → material + color attribute
        // Invisible art direction (slide mode, autonomous phase only): the
        // fields shape the TARGET, the swimmer's own physics move the body —
        // an active pointer chase bypasses both fields entirely.
        if (slideIds && phase === 'live' && !parked) {
          // Visual-space frustum clamp (slide mode): the species chase in
          // unscaled space but render at head×scale, so the engine's own 94%
          // clamp still lets a scaled species settle visually OFF-frame when
          // the pointer parks at a screen edge (measured 97.8% off-frame for
          // a corner-parked cursor). Dividing the clamp by the live scale
          // keeps the SETTLE point on-frame for every species; /lab keeps
          // the legacy behavior untouched.
          const sc = animal.cloud.points.scale.x || 1;
          const halfv = visibleHalfExtent(camera);
          target.x = THREE.MathUtils.clamp(target.x, (-halfv.w * 0.94) / sc, (halfv.w * 0.94) / sc);
          target.y = THREE.MathUtils.clamp(target.y, (-halfv.h * 0.94) / sc, (halfv.h * 0.94) / sc);
          // Observation (region membership, cumulative stats) runs even with
          // __ocSteerOff — the A/B harness needs identical telemetry in both
          // arms; only the APPLICATION is gated by the escape/idle state.
          const autonomous =
            (isTouch || time - lastMoveElapsed >= MOVE_IDLE_GAP) && !steerOff();
          steering.shape(
            target,
            animal.head,
            animal.cloud.points.scale.x,
            visibleHalfExtent(camera),
            regionFor(def.id, isTouch),
            Math.max(innerWidth, 1),
            Math.max(innerHeight, 1),
            dt,
            autonomous,
          );
        }
        // Off-screen catch-up (owner's ask 2026-08-06): when the creature's
        // head leaves the visible frustum it swims on a 4x time-warp until it
        // is back in frame, so it never dawdles where nobody can see it. The
        // boost ramps in/out (~1/3 s) to avoid a visible speed snap at the
        // frame edge; a 5% margin keeps the edge from flickering the boost.
        {
          const ext = visibleHalfExtent(camera);
          const s = animal.cloud.points.scale.x;
          const wx = Math.abs(animal.head.x * s - camera.position.x);
          const wy = Math.abs(animal.head.y * s - camera.position.y);
          const off = wx > ext.w * 1.05 || wy > ext.h * 1.05;
          const want = off ? OFFSCREEN_BOOST : 1;
          offscreenBoost += (want - offscreenBoost) * Math.min(1, dt * 3);
        }
        animal.update(target, dt * offscreenBoost, time);
        dwell += dt;

        // smoothed heading velocity (world-independent, unscaled space) —
        // consumed by the in-place morph variants at trigger time
        if (prevHeadValid && dt > 0) {
          instVel.copy(animal.head).sub(prevHead).divideScalar(dt);
          headVel.lerp(instVel, 0.15);
        }
        prevHead.copy(animal.head);
        prevHeadValid = true;

        // Tuning from /lab/ocean (live override) or the committed
        // ocean-hero.json (production default). Re-read every frame so a
        // dragged slider previews instantly with no respawn.
        const tuning = oceanHeroCfg.animals[def.id];
        const scale = liveScaleRef.current ?? tuning?.scale ?? DEFAULT_SCALE;
        animal.cloud.points.scale.setScalar(scale);

        const depthRange = liveDepthRef.current ?? tuning?.depthRange ?? DEFAULT_DEPTH_RANGE;
        if (Math.abs(animal.head.z) > depthRange) {
          // All particles are placed relative to `head` each frame, so
          // shifting head + every particle by the same delta relocates the
          // whole shape without distorting it — a soft "invisible wall" the
          // creature settles against instead of swimming through.
          const clampedZ = Math.sign(animal.head.z) * depthRange;
          const dz = clampedZ - animal.head.z;
          const pos = animal.cloud.pos;
          for (let i = 2; i < animal.cloud.N * 3; i += 3) pos[i] += dz;
          animal.cloud.geo.attributes.position.needsUpdate = true;
          animal.head.z = clampedZ;
        }

        // Keep the animal from fully swimming off-frame while still letting
        // it dip partway past the edge (real fish don't stop dead at a wall).
        // Same delta-shift trick as the depth clamp above, applied to X/Y
        // against a margin beyond the visible frustum instead of a hard cut
        // at the edge.
        const screenHalf = visibleHalfExtent(camera);
        const marginX = screenHalf.w * 1.18;
        const marginY = screenHalf.h * 1.18;
        const hx = animal.head.x;
        const hy = animal.head.y;
        if (Math.abs(hx) > marginX || Math.abs(hy) > marginY) {
          const cx = THREE.MathUtils.clamp(hx, -marginX, marginX);
          const cy = THREE.MathUtils.clamp(hy, -marginY, marginY);
          const dx = cx - hx;
          const dy = cy - hy;
          const pos = animal.cloud.pos;
          for (let i = 0; i < animal.cloud.N * 3; i += 3) {
            pos[i] += dx;
            pos[i + 1] += dy;
          }
          animal.cloud.geo.attributes.position.needsUpdate = true;
          animal.head.x = cx;
          animal.head.y = cy;
        }

        if (phase === 'assemble' && fx) {
          // variant choreography owns the assembly (in-place, staggered)
          if (fx.blend(animal.cloud, animal.head, dt)) {
            phase = 'live';
            animal.cloud.mat.opacity = baseOpacity;
            fx.dispose();
            fx = null;
          }
        } else if (phase === 'assemble' && assembleFrom) {
          phaseT += dt;
          const t = Math.min(1, phaseT / assembleT);
          const k = 1 - ease(t);
          const pos = animal.cloud.pos;
          for (let i = 0; i < animal.cloud.N * 3; i++) pos[i] = pos[i] + (assembleFrom[i] - pos[i]) * k;
          animal.cloud.geo.attributes.position.needsUpdate = true;
          animal.cloud.mat.opacity = baseOpacity * (0.15 + 0.85 * ease(t));
          if (t >= 1) {
            phase = 'live';
            assembleFrom = null;
            animal.cloud.mat.opacity = baseOpacity;
          }
        } else if (phase === 'live') {
          // morph triggers
          let trigger = false;
          if (morphReq.current !== lastMorphReq) {
            lastMorphReq = morphReq.current;
            trigger = true;
          }
          if (slideIds) {
            // Slide mode: the actual scatter/reassemble only fires once the
            // slide index itself changes (bullet click, or the parent
            // reacting to onAdvance below) — never directly from a timer.
            if (slideReq.current !== appliedSlide) {
              appliedSlide = slideReq.current;
              pendingIdx = slideDefIdx(appliedSlide);
              trigger = true;
              advanceRequested = false;
              idleAccum = 0;
              catchT = 0;
            } else if (!advanceRequested) {
              if (isTouch) {
                if (dwell > TOUCH_MORPH) { advanceRequested = true; advRef.current?.(); }
              } else {
                const moving = time - lastMoveElapsed < MOVE_IDLE_GAP;
                if (moving) {
                  idleAccum = 0;
                  // actively chasing ("playing") → advance on catch, not on a timer
                  const d = animal.head.distanceTo(rawCursor);
                  if (!parked && d < catchRNow()) {
                    catchT += dt;
                    if (catchT > CATCH_HOLD) { advanceRequested = true; advRef.current?.(); }
                  } else catchT = Math.max(0, catchT - dt * 2);
                } else {
                  idleAccum += dt;
                  if (idleAccum > IDLE_ADVANCE_SEC) { advanceRequested = true; advRef.current?.(); }
                }
              }
            }
          } else if (disableAutoMorph) {
            // /lab: stay on the picked animal — only morphSignal (above) or
            // a new forceId (which respawns) changes it.
          } else if (isTouch || def.morph === 'timer') {
            if (dwell > (isTouch ? TOUCH_MORPH : TIMER_MORPH)) trigger = true;
          } else if (dwell > MIN_DWELL) {
            // measure against the REAL cursor: an edge cursor is unreachable,
            // so no morph fires "half a screen away" at the clamped point.
            // While parked (pointer over the /lab panel) catch never fires.
            const d = animal.head.distanceTo(rawCursor);
            if (!parked && d < catchRNow()) {
              catchT += dt;
              if (catchT > CATCH_HOLD) trigger = true;
            } else catchT = Math.max(0, catchT - dt * 2);
            // no time-based failsafe here: it fired mid-chase ("morphed half a
            // screen from the cursor"); with the clamped target every catch
            // animal can genuinely reach the cursor, so morphs are earned
          }
          if (trigger && !ghost && !fx) beginScatter();
        }
      }

      // Body density mode: (re)apply on select change or fresh spawn, then
      // per-frame sync (sphere transforms / halo opacity). Runs after the
      // phase logic so a beginScatter above (animal → null) is respected —
      // dropBodyFx() there already released the old cloud's handle.
      if (animal) {
        const wantBody = bodyModeNow();
        if (bodyFx && bodyFx.mode !== wantBody) dropBodyFx();
        if (!bodyFx) bodyFx = applyBodyMode(world, animal.cloud, wantBody, look);
        bodyFx.update();
      }

      // debug probe for the /lab harness (tiny, harmless in prod)
      if (animal) {
        const w = window as unknown as { __ocN?: number };
        w.__ocN = (w.__ocN ?? 0) + 1; // frame-loop counter: rate >> fps ⇒ duplicate loops
        const r2 = (v: number) => Math.round(v * 100) / 100;
        (window as unknown as { __ocDbg?: unknown }).__ocDbg = {
          id: def.id, phase, dwell: Math.round(dwell * 10) / 10,
          // render pos = head × scale (species chase in unscaled space) —
          // harnesses need the live scale to project between the two spaces
          scale: r2(animal.cloud.points.scale.x),
          d: r2(animal.head.distanceTo(rawCursor)),
          h: [r2(animal.head.x), r2(animal.head.y), r2(animal.head.z)],
          c: [r2(rawCursor.x), r2(rawCursor.y), r2(rawCursor.z)],
          t: [r2(target.x), r2(target.y), r2(target.z)],
          appliedSlide, idle: r2(idleAccum), moving: time - lastMoveElapsed < MOVE_IDLE_GAP,
          steer: slideIds ? steering.getTelemetry() : null,
          mv: variantNow(), lm: lastMorph, parked,
          // effective (post-fallback) tuning values — /lab asserts sliders land
          catchR: r2(catchRNow()), camZ: r2(camZNow()), camPosZ: r2(camera.position.z),
          // sprite selection: [glow level 0..4, hardening], base = stock
          // texture untouched (the harness asserts prod default == shipped)
          spr: {
            lvl: look?.level ?? 2, h: look?.h ?? 0, sf: look?.sf ?? 1,
            base: animal.cloud.mat.map === sprites.base,
            size: r2(animal.cloud.mat.size), at: r2(animal.cloud.mat.alphaTest),
          },
          // live behavior params actually seen by the species this frame
          bp: animal.p ?? null,
          // in-scene flora: per-element guaranteed-opaque screen rects — the
          // harness samples these pixels to PROVE per-fragment occlusion
          // (zero bright creature pixels inside a nearer element), not
          // eyeball. Rect math lives with each biome (flora.rect), which
          // mirrors its own fragment mask + bend formulas.
          flora: flora
            ? {
                id: flora.id, g: Math.round(flora.g * 1000) / 1000,
                rects: flora.strands.map((s) =>
                  (flora as FloraHandle).rect(s, host.clientWidth, host.clientHeight)),
              }
            : null,
        };
        // live sprite canvas (reference only, zero copies) — the /lab harness
        // reads the ACTUAL alpha profile being rendered to prove the glow
        // knob keeps the dot core stable while reshaping only the halo
        (window as unknown as { __ocSpriteImg?: unknown }).__ocSpriteImg =
          (look?.tex ?? sprites.base).image;
      }

      // __ocActorHide (see actorHide above): the visual half of "creature
      // removed" — covers the default glow body only (body-fx extras stay
      // visible; the harness runs in glow mode).
      if (animal) animal.cloud.points.visible = !actorHide();

      renderer.render(scene, camera);
    }

    const host = el; // non-null alias (fn declarations don't keep the narrow)

    function onResize(): void {
      const w = host.clientWidth, h = Math.max(1, host.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    addEventListener('resize', onResize);

    // Pause the render loop entirely while the Hero is scrolled out of view
    // — two live WebGL contexts (this + the footer's) burning GPU/CPU when
    // neither is on screen is what caused the reported scroll lag. A little
    // rootMargin starts it back up slightly before the section is visible
    // so there's no pop-in.
    const io = new IntersectionObserver(
      ([entry]) => {
        if (reduced) return; // static frame only, nothing to pause
        if (entry.isIntersecting) startLoop();
        else stopLoop();
      },
      { rootMargin: '200px 0px' },
    );
    io.observe(host);

    if (reduced) {
      // single assembled static frame
      if (animal) {
        (animal as OceanAnimal).update(new THREE.Vector3(1.5, 0.4, 0), 1 / 60, 0.5);
        (animal as OceanAnimal).cloud.mat.opacity = baseOpacity;
      }
      // binary occlusion resolve for the static frame (closure: TS narrows
      // the effect-body `flora` to its initializer null through syncFlora)
      const staticFloraFrame = (): void => {
        flora?.setPalette(def.bg, true); // reduced motion: snap, no lerp
        flora?.update(0, creatureSlab());
        renderer.render(scene, camera);
      };
      staticFloraFrame();
      // flora switches (lab bg select) re-render the static frame; strands
      // stay at their frozen (time 0, per-strand phase) pose
      floraPokeRef.current = () => {
        syncFlora();
        staticFloraFrame();
      };
    } else {
      startLoop();
    }

    return () => {
      floraPokeRef.current = null;
      stopLoop();
      io.disconnect();
      removeEventListener('resize', onResize);
      if (zoneTimer) clearInterval(zoneTimer);
      if (slideIds) removeEventListener('resize', measureZones);
      if (!isTouch) removeEventListener('pointermove', onPointer);
      dropBodyFx();
      animal?.dispose();
      fx?.dispose();
      if (ghost) {
        scene.remove(ghost.points);
        ghost.geo.dispose();
        ghost.mat.dispose();
      }
      flora?.dispose();
      water.dispose();
      sprites.dispose(); // includes world.sprite (= sprites.base)
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
    // forceId intentionally restarts the engine from the /lab picker
  }, [forceId]);

  return <div ref={mountRef} aria-hidden className="pointer-events-none absolute inset-0 -z-10" />;
}
