/*!
 * particle-ocean · https://github.com/ekazanec/particle-ocean
 * Copyright (c) 2026 Andrey Gurov · https://agurov.com
 * MIT licensed. If you ship something built on this, a link back is appreciated.
 */
/**
 * Ocean flora — five in-scene SEAFLOOR BIOMES paired with their 2D backdrops
 * (see BG_FLORA). Unlike the fullscreen hero-uw-* shaders, which live on a
 * separate canvas UNDER the creature layer and can only fake overlap, these
 * are real depth-writing meshes INSIDE the creature scene: every creature
 * pass (additive glow points, morph ghosts, opaque/core-glow discs, instanced
 * spheres) keeps depthTest on, so an element nearer to the camera occludes
 * the creature per-fragment. Only two states are possible — fully behind an
 * element shows zero creature pixels through it, fully in front covers it.
 *
 * 2026-07-30 redo #2. The first flora was ONE plant (a kelp ribbon) offered
 * in five motion modes — rejected on sight ("you just stuffed it with sticks"): five sway
 * selects on the same stick are not five designs. This module now hosts five
 * DISTINCT biomes — different vegetation geometry, different floor, different
 * motion character, different light — each activated by its own Background
 * entry in /lab/ocean («Underwater»):
 *
 *   kelp      «Kelp cathedral»  — giant kelp with pneumatocyst bladders and
 *                                  ruffled leaf blades on sinuous stipes;
 *                                  stately surge; god-ray shafts.
 *   seagrass  «Eelgrass meadow»    — a low meadow of thin grass blades in
 *                                  clumps over rippled sand; wind-like waves
 *                                  TRAVELING across the meadow; caustics.
 *   gorgonia  «Gorgonian garden»   — lace sea fans on rocky outcrops, rocking
 *                                  stiffly from the holdfast; polyp shimmer;
 *                                  warm tropical-night accent light.
 *   biolum    «Glowing garden»   — near-black abyss garden of feathered sea
 *                                  pens and whips; bioluminescent pulses
 *                                  climbing the stalks; ghostly slow lean.
 *   reef      «Rocky reef»     — boulder/ledge silhouettes with short
 *                                  algae tufts in the crevices, rocked by a
 *                                  strong heavy surge; cold moonlight.
 *
 * Each biome file (ocean/biomes/<id>.ts) owns its GEOMETRY (fragment-shader
 * silhouettes on instanced planes — per-instance seeded, organically varied,
 * never a repeated stick), its MOTION (a vertex bend field obeying the
 * accepted water rules: anchored at the root, tip lag, slow periods, |coef|
 * capped ≤ 1.4, ZERO pointer input) and its LIGHT (sampling the SAME field
 * its 2D backdrop renders with, on the shared absolute page clock).
 *
 * This file owns the ACCEPTED shared machinery, unchanged in behavior:
 *
 * WHOLE-CREATURE BINARY occlusion (the owner rejected an "honest" straddle: flippers must not
 * poke in front of a leaf while the body is still behind it): an element
 * must never sit INSIDE the creature's occupied z-slab. Each frame the host
 * passes the slab; an element whose home z falls inside is slid OUT to the
 * nearer face — along the ray through the camera, with its scale compensated
 * by the same factor, so its screen-space silhouette is pixel-identical and
 * only its depth changes. The slide SNAPS (projective invariance makes the
 * snap invisible); hysteresis stops face ping-pong under a hovering actor.
 *
 * DARKNESS DISCIPLINE: every biome's fragment output is clamped to a
 * near-silhouette ceiling (≤ 0.20, most at 0.14) so no lit element pixel can
 * cross the occlusion sensor's creature threshold (60/255 ≈ 0.235) — the
 * flora reads through light interaction (rays/caustics/pulses), not through
 * its own brightness.
 *
 * ACTOR PROPORTION: element sizes follow the live animal compressively —
 * g = clamp(sqrt(size/REF), 0.85, 1.25) — so the scene may lean with the
 * actor but never turns into another biome when the animal changes.
 *
 * PROOF RECTS: each biome declares, per element kind, a screen region that
 * is GUARANTEED opaque at the current instant (a solid base band of the
 * silhouette, minus the live bend + slack). The /lab harness samples those
 * pixels to PROVE per-fragment occlusion — never by eyeballing.
 *
 * Reduced motion: the host simply never calls update() — uTime stays 0 and
 * every element freezes at its own random phase (varied, static).
 */
import * as THREE from 'three';
import { UW_NOISE_GLSL } from '@/components/motion/hero-uw-shader';
import type { WorldCtx } from '@/components/motion/ocean/core';

export type OceanFloraId = 'kelp' | 'seagrass' | 'gorgonia' | 'biolum' | 'reef';

/**
 * Background-effect id (hero-effects registry) → the in-scene biome it
 * activates. One Background selection turns on both the 2D ambience layer
 * and the in-scene geometry.
 */
export const BG_FLORA: Record<string, OceanFloraId> = {
  'uw-kelp': 'kelp',
  'uw-seagrass': 'seagrass',
  'uw-gorgonia': 'gorgonia',
  'uw-biolum-garden': 'biolum',
  'uw-rockreef': 'reef',
};

export interface FloraStrand {
  /** HOME world root position (y — element base, at/below the frame edge). */
  x: number;
  y: number;
  z: number;
  /** Element height / full base width, world units (home). */
  h: number;
  w: number;
  /** World-unit sway amplitude (tip ≤ ±1.4·sway) — occlusion-proof math. */
  sway: number;
  /** Hard height ceiling (world): tip may never rise above the biome cap. */
  hMax: number;
  /** Per-element random phase — the harness mirrors the CURRENT bend. */
  phase: number;
  /** Per-element stiffness 0.6..1.4 — response/lag heterogeneity. */
  stiff: number;
  /** Per-element silhouette seed 0..1 — no two elements share a shape. */
  seed: number;
  /** Element class within the biome (kelp/mound/…, biome-defined). */
  kind: number;
  band: 'far' | 'mid' | 'near';
  /**
   * EFFECTIVE placement after the whole-creature binary resolve: home values
   * slid along the camera ray by factor k (screen-projection invariant).
   * These are what actually renders — proof rects must use them.
   */
  ex: number;
  ey: number;
  ez: number;
  eh: number;
  ew: number;
  esway: number;
  /** Which face of the creature slab the element is resolved to. */
  side: 'home' | 'front' | 'back';
}

/** Creature-occupied z range (render space, margins included by the host). */
export interface FloraSlab {
  lo: number;
  hi: number;
  /**
   * Actor's max world extent across axes (render space) — drives the flora
   * proportion factor. Absent (e.g. mid-morph, no live animal) → the flora
   * keeps its previous proportion target.
   */
  size?: number;
}

/** Per-animal palette (registry `bg`) the flora adapts its colors to. */
export interface FloraPalette {
  c0: [number, number, number];
  c1: [number, number, number];
  c2: [number, number, number];
  accent: [number, number, number];
}

export interface FloraHandle {
  id: OceanFloraId;
  /** Element layout — the /lab harness projects these to screen rects. */
  strands: FloraStrand[];
  /** Motion clock last passed to update() — 0 under reduced motion. */
  time: number;
  /** Live actor-proportion factor g (element size multiplier). */
  g: number;
  /**
   * Advance the motion clock and resolve the whole-creature binary occlusion
   * against the creature's z-slab (null — no creature, elements at home).
   */
  update(time: number, slab?: FloraSlab | null): void;
  /**
   * Adapt element tint / glint / fog toward the animal's palette; lerped in
   * update() at the backdrop's pace (`snap` — instant, for reduced motion).
   */
  setPalette(pal: FloraPalette | null, snap?: boolean): void;
  /**
   * Screen rect (CSS px of the hero canvas) of a region of this element
   * PROVABLY opaque at the current instant — biome-declared solid base band
   * minus the live bend and a latency slack. `ok:false` = not proofable
   * (thin/branching kinds) or degenerate — the harness must skip it.
   */
  rect(s: FloraStrand, W: number, H: number): Record<string, number | string | boolean>;
  dispose(): void;
}

/* ------------------------------------------------------------------ spec */

/** What a biome's layout() gets to place elements with. */
export interface BiomeLayoutCtx {
  cam: THREE.PerspectiveCamera;
  camZ: number;
  tanF: number;
  /** Frustum half-height at world z (camera-centered). */
  hh(z: number): number;
  /** Frustum half-width at world z (with the house 1.04 overscan). */
  hw(z: number): number;
  /** World y of the visible bottom edge at world z. */
  bottom(z: number): number;
  /** Clamp a band's z range below the camera (near blades stay in front). */
  zRange(z0: number, z1: number): [number, number];
}

/** One element blueprint produced by a biome's layout(). */
export interface BiomeSeed {
  x: number;
  y: number;
  z: number;
  h: number;
  w: number;
  sway: number;
  hMax: number;
  phase: number;
  stiff: number;
  seed: number;
  kind: number;
  tint: [number, number, number];
  band: FloraStrand['band'];
}

/** Per-kind proof-rect declaration (world-unit mask, bend units of esway). */
export interface BiomeProof {
  /** Top of the guaranteed-solid base band (0..1 along the element). */
  yyMax: number;
  /** Guaranteed-opaque HALF-width (world units) of the band at yy. */
  maskHalf(yy: number, s: FloraStrand): number;
  /** Bend-envelope slack across [yyLo, yyHi] + screenshot latency, ×esway. */
  slack(yyLo: number, yyHi: number): number;
}

export interface BiomeSpec {
  id: OceanFloraId;
  /** Plane height segments (vertex-bend smoothness; grass needs fewer). */
  segments: number;
  /** Fragment-output luminance ceiling (darkness discipline, ≤ 0.20). */
  cap: number;
  layout(ctx: BiomeLayoutCtx): BiomeSeed[];
  /**
   * GLSL defining
   *   float biomeBend(float t, float phase, float rootX, float stiff,
   *                   float kind, float yy)
   * — lateral offset in units of aSway. Pure function of time + per-element
   * constants; NO pointer term exists in any biome by design.
   */
  bendGlsl: string;
  /** TS mirror of biomeBend — MUST stay formula-identical (proof rects). */
  bendCoef(t: number, phase: number, rootX: number, stiff: number, kind: number, yy: number): number;
  /**
   * Fragment shader tail: helper functions + main(). Receives the shared
   * prologue (uniforms uTime/uRayT/uAspect/uFog/uShift/uGlint, varyings
   * vUv/vPhase/vSeed/vKind/vRatio/vTint/vViewZ/vClip, UW noise lib,
   * biomeScreen(), biomeFinish()). Must discard outside the silhouette so
   * the depth buffer only ever holds honest silhouette fragments, and must
   * output via biomeFinish() (cap + manual FogExp2 to match the scene).
   */
  fragGlsl: string;
  /** Extra biome uniforms merged into the material. */
  extraUniforms?(): Record<string, THREE.IUniform>;
  /** Palette-adaptation anchors (see setPalette). */
  palette: {
    ref: [number, number, number];
    glint: [number, number, number];
    fog: number;
  };
  /** Proof-rect declarations by element kind; absent kind → ok:false. */
  proof: Record<number, BiomeProof>;
}

/* --------------------------------------------------------- shared GLSL */

const BIOME_VERT = /* glsl */ `
  uniform float uTime;
  attribute float aPhase;
  attribute float aSway;
  attribute float aK;
  attribute float aStiff;
  attribute float aRootX;
  attribute float aKind;
  attribute float aSeed;
  attribute float aRatio;
  attribute vec3 aTint;
  varying vec2 vUv;
  varying float vPhase;
  varying float vSeed;
  varying float vKind;
  varying float vRatio;
  varying vec3 vTint;
  varying float vViewZ;
  varying vec4 vClip;
__BEND__
  void main() {
    vUv = uv;
    vPhase = aPhase;
    vSeed = aSeed;
    vKind = aKind;
    vRatio = aRatio;
    vTint = aTint;
    vec4 wp = instanceMatrix * vec4(position, 1.0);
    // Biome water motion: zero at the root, accumulating along the length,
    // tip lagging the base, slow damped periods, |coef| ≤ 1.4 — and NO
    // pointer input, water plants do not follow the viewer's cursor.
    // World-unit offset applied AFTER the instance transform so it doesn't
    // scale with element width. aK — the whole-creature-occlusion ray-slide
    // factor: world sway must scale with the element so its screen-space
    // amplitude stays identical.
    float yy = uv.y;
    wp.x += biomeBend(uTime, aPhase, aRootX, aStiff, aKind, yy) * aSway * aK;
    vec4 mv = modelViewMatrix * wp;
    vViewZ = -mv.z;
    gl_Position = projectionMatrix * mv;
    vClip = gl_Position; // per-fragment screen uv for the shared light field
  }
`;

const BIOME_FRAG_PROLOGUE = /* glsl */ `
  uniform float uTime;
  uniform float uRayT;
  uniform float uAspect;
  uniform vec3 uFog;
  uniform vec3 uShift;
  uniform vec3 uGlint;
  varying vec2 vUv;
  varying float vPhase;
  varying float vSeed;
  varying float vKind;
  varying float vRatio;
  varying vec3 vTint;
  varying float vViewZ;
  varying vec4 vClip;
${UW_NOISE_GLSL}
  // fragment's own screen position (0..1) — the shared backdrop-synced
  // light fields sample here, on the shared absolute page clock (uRayT)
  vec2 biomeScreen() { return vClip.xy / vClip.w * 0.5 + 0.5; }
  // Darkness discipline + scene fog in one place: the ceiling keeps every
  // lit element pixel far below the occlusion sensor's creature threshold
  // (60/255), and the manual FogExp2 matches the creature scene's
  // (ShaderMaterial ignores scene.fog).
  vec3 biomeFinish(vec3 col) {
    col = min(col, vec3(BIOME_CAP));
    float f = 1.0 - exp(-pow(vViewZ * 0.045, 2.0));
    return mix(col, uFog, clamp(f, 0.0, 1.0));
  }
`;

/* ------------------------------------------------------------ framework */

/** Element ↔ slab clearance: resolved elements keep this z-gap. */
const CLEAR = 0.45;
/** Hysteresis: a hovering creature can't ping-pong an element. */
const HYS = 0.35;
/** Displaced elements never come nearer the camera than this. */
const CAM_GAP = 1.6;
/**
 * Flora proportions scale with the actor: g = clamp(sqrt(size/REF), MIN,
 * MAX) — compressive response, hard ±25%-ish clamp: the biome may lean with
 * the actor but must NEVER look like another biome when the animal changes.
 * REF ≈ the sea-turtle, g ≈ 1.
 */
const ACTOR_REF = 3.4;
const ACTOR_G_MIN = 0.85;
const ACTOR_G_MAX = 1.25;
const PAL_LERP = 0.035;

function makeBiome(world: WorldCtx, spec: BiomeSpec): FloraHandle {
  const cam = world.camera;
  const camZ = cam.position.z;
  const tanF = Math.tan((cam.fov * Math.PI) / 360);
  const ctx: BiomeLayoutCtx = {
    cam,
    camZ,
    tanF,
    hh: (z) => tanF * (camZ - z),
    hw: (z) => tanF * (camZ - z) * cam.aspect * 1.04,
    bottom: (z) => cam.position.y - tanF * (camZ - z) * 1.04,
    zRange: (z0, z1) => {
      // Elements must stay in front of the camera with breathing room even
      // when a species' tuned camZ is short (lab slider goes down to 4).
      const c1 = Math.min(z1, camZ - 2.6);
      return [Math.min(z0, c1 - 0.4), c1];
    },
  };

  const seeds = spec.layout(ctx);
  const N = seeds.length;
  const strands: FloraStrand[] = [];
  const phases = new Float32Array(N);
  const sways = new Float32Array(N);
  const stiffs = new Float32Array(N);
  const rootXs = new Float32Array(N);
  const kinds = new Float32Array(N);
  const seedsA = new Float32Array(N);
  const ratios = new Float32Array(N);
  const tints = new Float32Array(N * 3);
  const matrices: THREE.Matrix4[] = [];
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const quat = new THREE.Quaternion();

  seeds.forEach((b, i) => {
    strands.push({
      x: b.x, y: b.y, z: b.z, h: b.h, w: b.w, sway: b.sway, hMax: b.hMax,
      phase: b.phase, stiff: b.stiff, seed: b.seed, kind: b.kind, band: b.band,
      ex: b.x, ey: b.y, ez: b.z, eh: b.h, ew: b.w, esway: b.sway, side: 'home',
    });
    phases[i] = b.phase;
    sways[i] = b.sway;
    stiffs[i] = b.stiff;
    rootXs[i] = b.x; // HOME x — motion fields ignore occlusion ray-slides
    kinds[i] = b.kind;
    seedsA[i] = b.seed;
    ratios[i] = b.w / b.h;
    tints[i * 3] = b.tint[0];
    tints[i * 3 + 1] = b.tint[1];
    tints[i * 3 + 2] = b.tint[2];
    pos.set(b.x, b.y, b.z);
    scl.set(b.w, b.h, 1);
    matrices.push(new THREE.Matrix4().compose(pos, quat, scl));
  });

  // Unit plane, origin at the root center; per-element extras ride as
  // InstancedBufferAttributes on the shared geometry — one draw call.
  const geo = new THREE.PlaneGeometry(1, 1, 1, spec.segments);
  geo.translate(0, 0.5, 0);
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
  geo.setAttribute('aSway', new THREE.InstancedBufferAttribute(sways, 1));
  geo.setAttribute('aStiff', new THREE.InstancedBufferAttribute(stiffs, 1));
  geo.setAttribute('aRootX', new THREE.InstancedBufferAttribute(rootXs, 1));
  geo.setAttribute('aKind', new THREE.InstancedBufferAttribute(kinds, 1));
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seedsA, 1));
  geo.setAttribute('aRatio', new THREE.InstancedBufferAttribute(ratios, 1));
  geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tints, 3));
  const kAttr = new THREE.InstancedBufferAttribute(new Float32Array(N).fill(1), 1);
  geo.setAttribute('aK', kAttr);

  const mat = new THREE.ShaderMaterial({
    defines: {
      // guard: no biome may raise its ceiling near the sensor threshold
      BIOME_CAP: Math.min(spec.cap, 0.2).toFixed(3),
    },
    vertexShader: BIOME_VERT.replace('__BEND__', spec.bendGlsl),
    fragmentShader: BIOME_FRAG_PROLOGUE + spec.fragGlsl,
    uniforms: {
      uTime: { value: 0 },
      // shared absolute page clock + live aspect for backdrop-synced light
      // fields — must match the UnderwaterShader host exactly
      uRayT: { value: performance.now() / 1000 },
      uAspect: { value: cam.aspect },
      uFog: { value: new THREE.Color(spec.palette.fog) },
      uShift: { value: new THREE.Vector3(1, 1, 1) },
      uGlint: { value: new THREE.Vector3(...spec.palette.glint) },
      ...(spec.extraUniforms?.() ?? {}),
    },
    // opaque + depth-written: renders in the opaque pass BEFORE every
    // transparent creature pass, so their depthTest sees the elements
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.InstancedMesh(geo, mat, N);
  for (let i = 0; i < N; i++) mesh.setMatrixAt(i, matrices[i]);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false; // instance bounds aren't tracked (house habit)
  world.scene.add(mesh);

  // per-element ray-slide state for the whole-creature binary resolve
  const ks = new Float32Array(N).fill(1);
  const im = mesh.instanceMatrix.array as Float32Array;
  const kArr = kAttr.array as Float32Array;

  // palette-adaptation targets (uniforms lerp toward them in update at the
  // same ~2 s half-life the uw backdrop / ShaderHero use)
  const BASE_GLINT = new THREE.Vector3(...spec.palette.glint);
  const BASE_FOG = new THREE.Color(spec.palette.fog);
  const palShiftT = new THREE.Vector3(1, 1, 1);
  const palGlintT = BASE_GLINT.clone();
  const palFogT = BASE_FOG.clone();

  // actor-proportion factor state (target from slab.size, glides in update)
  let gTarget = 1;

  const rectP = new THREE.Vector3();
  const r2 = (v: number): number => Math.round(v * 100) / 100;

  const handle: FloraHandle = {
    id: spec.id,
    strands,
    time: 0,
    g: 1,
    update(time, slab) {
      handle.time = time;
      mat.uniforms.uTime.value = time;
      mat.uniforms.uRayT.value = performance.now() / 1000;
      mat.uniforms.uAspect.value = world.camera.aspect;
      // reduced motion renders exactly one frame at time 0 — transitions snap
      const lf = time === 0 ? 1 : PAL_LERP;
      (mat.uniforms.uShift.value as THREE.Vector3).lerp(palShiftT, lf);
      (mat.uniforms.uGlint.value as THREE.Vector3).lerp(palGlintT, lf);
      (mat.uniforms.uFog.value as THREE.Color).lerp(palFogT, lf);
      // flora proportions follow the actor's size on the same clock — a
      // morph eases the biome to the next animal's proportions, no pop
      if (slab && slab.size !== undefined) {
        gTarget = THREE.MathUtils.clamp(
          Math.sqrt(slab.size / ACTOR_REF), ACTOR_G_MIN, ACTOR_G_MAX,
        );
      }
      const gPrev = handle.g;
      let g = gPrev + (gTarget - gPrev) * lf;
      if (Math.abs(g - gTarget) < 1e-3) g = gTarget;
      handle.g = g;
      const gDirty = Math.abs(g - gPrev) > 1e-4;
      // Whole-creature binary occlusion: no element may sit inside the
      // creature's z-slab. An element whose home z falls inside is slid to
      // the nearer face ALONG THE CAMERA RAY with scale ×k — screen-
      // projection identical, only depth changes, so the snap is invisible.
      // Hysteresis (HYS) stops face ping-pong while the creature hovers.
      const camP = world.camera.position;
      let matDirty = false;
      let kDirty = false;
      for (let i = 0; i < N; i++) {
        const s = strands[i];
        let side = s.side;
        if (!slab) {
          side = 'home';
        } else {
          const lo = slab.lo - CLEAR;
          const hi = slab.hi + CLEAR;
          const center = (lo + hi) / 2;
          if (side === 'home') {
            if (s.z > lo && s.z < hi) side = s.z >= center ? 'front' : 'back';
          } else if (s.z <= lo - HYS || s.z >= hi + HYS) {
            side = 'home'; // creature left — element returns to true depth
          } else if (side === 'front' && s.z < center - HYS) {
            side = 'back';
          } else if (side === 'back' && s.z > center + HYS) {
            side = 'front';
          }
          // never displace into the camera; behind is always legal
          if (side === 'front' && hi > camP.z - CAM_GAP) side = 'back';
        }
        const zT = !slab || side === 'home' ? s.z : side === 'front' ? slab.hi + CLEAR : slab.lo - CLEAR;
        const k = (camP.z - zT) / (camP.z - s.z);
        const changed = Math.abs(k - ks[i]) > 1e-4;
        s.side = side;
        if (changed || gDirty || k !== 1 || g !== 1) {
          // displaced elements track the live camera every frame so the
          // projection invariance holds even while the camera lerps;
          // g scales dimensions in place (roots stay put), with the
          // per-element hMax ceiling keeping tips under the biome cap
          const b = i * 16;
          s.ex = camP.x + (s.x - camP.x) * k;
          s.ey = camP.y + (s.y - camP.y) * k;
          s.ez = camP.z + (s.z - camP.z) * k;
          s.ew = s.w * g * k;
          s.eh = Math.min(s.h * g, s.hMax) * k;
          s.esway = s.sway * g * k;
          im[b] = s.ew;
          im[b + 5] = s.eh;
          im[b + 12] = s.ex;
          im[b + 13] = s.ey;
          im[b + 14] = s.ez;
          matDirty = true;
          if (changed || gDirty) {
            ks[i] = k;
            kArr[i] = k * g; // shader sway amplitude follows both factors
            kDirty = true;
          }
        }
      }
      if (matDirty) mesh.instanceMatrix.needsUpdate = true;
      if (kDirty) kAttr.needsUpdate = true;
    },
    setPalette(pal, snap = false) {
      if (!pal) {
        palShiftT.set(1, 1, 1);
        palGlintT.copy(BASE_GLINT);
        palFogT.copy(BASE_FOG);
      } else {
        // elements keep their biome silhouette structure; the SHIFT is a
        // per-channel multiplier toward the palette's mid tone (uC1 role)
        const ref = spec.palette.ref;
        const sh = (c: number, r: number): number =>
          THREE.MathUtils.clamp(((r + c) * 0.5) / r, 0.4, 3);
        palShiftT.set(sh(pal.c1[0], ref[0]), sh(pal.c1[1], ref[1]), sh(pal.c1[2], ref[2]));
        // glint (rim + light fields) takes the palette's light/accent tones
        palGlintT.set(
          BASE_GLINT.x * 0.45 + (pal.accent[0] * 0.35 + pal.c2[0] * 0.6) * 0.55,
          BASE_GLINT.y * 0.45 + (pal.accent[1] * 0.35 + pal.c2[1] * 0.6) * 0.55,
          BASE_GLINT.z * 0.45 + (pal.accent[2] * 0.35 + pal.c2[2] * 0.6) * 0.55,
        );
        // manual FogExp2 tint leans toward the palette's deepest tone
        palFogT.setRGB(
          BASE_FOG.r * 0.4 + pal.c0[0] * 1.4 * 0.6,
          BASE_FOG.g * 0.4 + pal.c0[1] * 1.4 * 0.6,
          BASE_FOG.b * 0.4 + pal.c0[2] * 1.4 * 0.6,
        );
      }
      if (snap) {
        (mat.uniforms.uShift.value as THREE.Vector3).copy(palShiftT);
        (mat.uniforms.uGlint.value as THREE.Vector3).copy(palGlintT);
        (mat.uniforms.uFog.value as THREE.Color).copy(palFogT);
      }
    },
    // Screen rect of an element region PROVABLY opaque at the current
    // instant. The y band starts at the visible bottom edge (roots sit at or
    // below it) and spans up to 18% of the element height, capped at the
    // biome's per-kind solid-band ceiling. The x half-width is the kind's
    // guaranteed mask minimum around the CURRENT bend — computed with the
    // biome's TS mirror (formula-identical to the vertex shader) — minus a
    // slack for the bend's spread across the band and ~150 ms of screenshot
    // latency. EFFECTIVE placement (ex/ez/ew/…) is what renders and
    // occludes, so the rect is computed from it.
    rect(s, W, H) {
      const p = spec.proof[s.kind];
      const base = {
        band: s.band, kind: s.kind, z: r2(s.ez), hz: r2(s.z), side: s.side,
      };
      if (!p) return { ...base, ok: false };
      const camP = world.camera.position;
      const dist = camP.z - s.ez;
      const bottomW = camP.y - tanF * dist;
      const yLoW = Math.max(s.ey + 0.05 * s.eh, bottomW + dist * 0.02);
      const yyLo = (yLoW - s.ey) / s.eh;
      const yyHi = Math.min(yyLo + 0.18, p.yyMax);
      const degenerate = yyHi - yyLo < 0.06;
      const mask = p.maskHalf(yyHi, s);
      const yyMid = (yyLo + yyHi) / 2;
      const bend = spec.bendCoef(handle.time, s.phase, s.x, s.stiff, s.kind, yyMid) * s.esway;
      const slack = p.slack(yyLo, yyHi) * s.esway;
      const innerHalf = Math.max(mask - slack, 0);
      const cxW = s.ex + bend;
      rectP.set(cxW - innerHalf, yLoW, s.ez).project(world.camera);
      const ax = (rectP.x * 0.5 + 0.5) * W;
      const ay = (0.5 - rectP.y * 0.5) * H;
      rectP.set(cxW + innerHalf, s.ey + yyHi * s.eh, s.ez).project(world.camera);
      const bx = (rectP.x * 0.5 + 0.5) * W;
      const by = (0.5 - rectP.y * 0.5) * H;
      // clip into the canvas: any sub-rect of a guaranteed-opaque region is
      // itself guaranteed (full-width floor strips would otherwise never
      // pass the ok bounds check)
      const x0 = Math.max(Math.round(Math.min(ax, bx)), 4);
      const x1 = Math.min(Math.round(Math.max(ax, bx)), W - 4);
      const y0 = Math.max(Math.round(Math.min(ay, by)), 4);
      const y1 = Math.min(Math.round(Math.max(ay, by)), H - 4);
      // element tip in screen px (bend is lateral only — y is exact): the
      // height-cap assert (tips never above the biome band) reads this
      rectP.set(s.ex, s.ey + s.eh, s.ez).project(world.camera);
      const tipY = Math.round((0.5 - rectP.y * 0.5) * H);
      return {
        ...base, x0, x1, y0, y1, tipY,
        // sampling-reliability gate: a 15-px band across ≥10 px of width is
        // hundreds of guaranteed pixels — enough for the occlusion sensor
        ok: !degenerate && x1 - x0 >= 10 && y1 - y0 >= 15,
      };
    },
    dispose() {
      world.scene.remove(mesh);
      mesh.dispose();
      geo.dispose();
      mat.dispose();
    },
  };
  return handle;
}

/* ------------------------------------------------------------- dispatch */

import { KELP_BIOME } from '@/components/motion/ocean/biomes/kelp-cathedral';
import { SEAGRASS_BIOME } from '@/components/motion/ocean/biomes/seagrass';
import { GORGONIA_BIOME } from '@/components/motion/ocean/biomes/gorgonia';
import { BIOLUM_BIOME } from '@/components/motion/ocean/biomes/biolum';
import { REEF_BIOME } from '@/components/motion/ocean/biomes/rocky-reef';

const BIOMES: Record<OceanFloraId, BiomeSpec> = {
  kelp: KELP_BIOME,
  seagrass: SEAGRASS_BIOME,
  gorgonia: GORGONIA_BIOME,
  biolum: BIOLUM_BIOME,
  reef: REEF_BIOME,
};

/** Attach an in-scene biome to the creature scene. */
export function attachFlora(world: WorldCtx, id: OceanFloraId): FloraHandle {
  return makeBiome(world, BIOMES[id]);
}
