/**
 * Ocean core — shared plumbing for the particle-animal hero.
 *
 * This module is the reconstruction of the prototypes' missing
 * `swim-engine.js` "world" half (the source folder shipped only the
 * per-animal HTML; the shared engine was inferred from its call sites and
 * from the six self-contained prototypes that inline the same patterns).
 *
 * Local particle space convention (matches every prototype):
 *   lx — sideways, ly — forward along the body axis, lz — up.
 * `place()` maps local → world through the swimmer's rolled basis.
 */
import * as THREE from 'three';

/** Radial-gradient sprite used by every animal (identical across prototypes). */
export function makeSprite(): THREE.CanvasTexture {
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = 64;
  const cx = cnv.getContext('2d')!;
  const grad = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  cx.fillStyle = grad;
  cx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cnv);
}

// ---------------------------------------------------------------------------
// Glow sprite set — decouples «Glow» (halo intensity) from «Particle size».
//
// With additive blending the stock sprite's soft tail (65% of the radius at
// ≤0.6 alpha) dominates when the sprite scales: growing `size` reads as MORE
// GLOW, not bigger dots. The fix is a small family of sprite textures whose
// alpha falloff varies along two axes:
//   glow level (5 steps) — halo steepness/extent. Low glow → the tail dies at
//     ~half the radius (tight bright dot); high glow → the sprite itself is
//     drawn larger (sf) with the core fraction shrunk to compensate, so the
//     halo grows while the perceived dot core stays put.
//   hardening (3 steps, driven by particleSize > 1) — blends the profile
//     toward a hard disc, so scaled-up particles read as bigger DOTS instead
//     of bigger halos.
// Textures are generated lazily, cached, and swapped on the material ONLY
// when a knob crosses a level boundary — never per frame. Level (1×, no
// hardening) IS the untouched makeSprite() output byte-for-byte, so the
// shipped look is unchanged until a knob moves.
// ---------------------------------------------------------------------------

interface GlowLevelDef {
  /** Knob value this level represents (nearest-match quantization). */
  g: number;
  /** Sprite size factor baked into mat.size — halo extent beyond the quad. */
  sf: number;
  /** Piecewise-linear alpha stops [r, alpha], r in texture units (0..1). */
  stops: [number, number][];
}

// Level 2 is EXACTLY the shipped profile; core stops of sf≠1 levels are
// pre-divided by sf so the perceived dot core keeps its world size. The
// stock core is LINEAR (1 → 0.6 across world r 0..0.35), so the low-glow
// levels reproduce it exactly with a single stop at 0.35/sf and alpha 0.6 —
// verified by the harness's sprite-profile sensor (|Δalpha| < 0.1 in the
// core zone across all levels); only the tail beyond it changes.
const GLOW_LEVELS: GlowLevelDef[] = [
  { g: 0.3, sf: 0.9, stops: [[0, 1], [0.389, 0.6], [0.53, 0]] },
  { g: 0.65, sf: 0.95, stops: [[0, 1], [0.368, 0.6], [0.74, 0]] },
  { g: 1, sf: 1, stops: [[0, 1], [0.35, 0.6], [1, 0]] },
  { g: 1.45, sf: 1.15, stops: [[0, 1], [0.3, 0.62], [0.65, 0.3], [1, 0]] },
  { g: 2, sf: 1.3, stops: [[0, 1], [0.27, 0.65], [0.55, 0.38], [1, 0]] },
];
const DEFAULT_GLOW_LEVEL = 2;
/** Hard-disc profile the size knob blends toward (big particles read as dots). */
const HARD_DISC: [number, number][] = [[0, 1], [0.45, 1], [0.62, 0]];
/** Cap on the hard-disc blend — size must never fully strangle the halo. */
const HARD_BLEND = 0.6;

/** Piecewise-linear alpha at radius r (beyond the last stop → its alpha). */
function stopAlpha(stops: [number, number][], r: number): number {
  if (r <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (r <= stops[i][0]) {
      const [r0, a0] = stops[i - 1];
      const [r1, a1] = stops[i];
      return a0 + ((a1 - a0) * (r - r0)) / (r1 - r0);
    }
  }
  return stops[stops.length - 1][1];
}

/** Full sprite alpha profile for a glow level + hardening blend. */
function profileAlpha(level: number, h: number, r: number): number {
  const base = stopAlpha(GLOW_LEVELS[level].stops, r);
  if (h <= 0) return base;
  const k = HARD_BLEND * h;
  return base * (1 - k) + stopAlpha(HARD_DISC, r) * k;
}

/** Nearest glow level index for a continuous knob value. */
function glowLevelIndex(glow: number): number {
  let best = DEFAULT_GLOW_LEVEL;
  let bestD = Infinity;
  for (let i = 0; i < GLOW_LEVELS.length; i++) {
    const d = Math.abs(GLOW_LEVELS[i].g - glow);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/** Quantized core-hardening step (0 | 0.5 | 1) from the particle-size knob. */
function sizeHardening(size: number): number {
  return Math.round(THREE.MathUtils.clamp((size - 1) / 0.8, 0, 1) * 2) / 2;
}

/** The sprite selection an animal material currently renders with. */
export interface SpriteLook {
  tex: THREE.CanvasTexture;
  /** Glow level index (0..4); DEFAULT_GLOW_LEVEL = shipped texture. */
  level: number;
  /** Hardening blend actually baked into `tex` (0 | 0.5 | 1). */
  h: number;
  /** Size factor baked into mat.size alongside this texture. */
  sf: number;
  /** Continuous knob value (core-glow halo pass scales with it). */
  glow: number;
}

export interface SpriteSet {
  /** The untouched makeSprite() texture — default level, prod look. */
  base: THREE.CanvasTexture;
  /** Resolve (glow, size) knobs to a cached texture + calibration info. */
  lookFor(glow: number, size: number): SpriteLook;
  dispose(): void;
}

/** Render a non-default sprite level per-pixel from its analytic profile. */
function renderSpriteTex(level: number, h: number): THREE.CanvasTexture {
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = 64;
  const cx = cnv.getContext('2d')!;
  const img = cx.createImageData(64, 64);
  const d = img.data;
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const r = Math.min(1, Math.hypot(x + 0.5 - 32, y + 0.5 - 32) / 32);
      const i = (y * 64 + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = Math.round(profileAlpha(level, h, r) * 255);
    }
  }
  cx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(cnv);
}

/** Lazy-cached sprite family; `(default level, h=0)` IS makeSprite(). */
export function makeSpriteSet(): SpriteSet {
  const cache = new Map<string, THREE.CanvasTexture>();
  const base = makeSprite();
  cache.set(`${DEFAULT_GLOW_LEVEL}:0`, base);
  return {
    base,
    lookFor(glow, size) {
      const level = glowLevelIndex(glow);
      const h = sizeHardening(size);
      const key = `${level}:${h}`;
      let tex = cache.get(key);
      if (!tex) {
        tex = renderSpriteTex(level, h);
        cache.set(key, tex);
      }
      return { tex, level, h, sf: GLOW_LEVELS[level].sf, glow };
    },
    dispose() {
      for (const t of cache.values()) t.dispose();
      cache.clear();
    },
  };
}

/** Outermost radius where the profile still reaches `aT` (piecewise-exact). */
function crossR(level: number, h: number, aT: number): number {
  const xs = Array.from(
    new Set([...GLOW_LEVELS[level].stops.map((s) => s[0]), ...HARD_DISC.map((s) => s[0]), 1]),
  ).sort((a, b) => a - b);
  for (let i = xs.length - 1; i > 0; i--) {
    const a0 = profileAlpha(level, h, xs[i - 1]);
    const a1 = profileAlpha(level, h, xs[i]);
    if (a0 >= aT && aT >= a1) {
      if (a0 === a1) return xs[i];
      return xs[i - 1] + ((xs[i] - xs[i - 1]) * (a0 - aT)) / (a0 - a1);
    }
  }
  return xs[0];
}

/**
 * Per-texture alphaTest calibration for the opaque/core-glow body modes.
 * The shipped constants (0.42 / 0.55) cut the DEFAULT profile at r = 0.545 /
 * 0.404 — for any other sprite level the threshold is re-derived so the hard
 * disc edge lands at the SAME world radius (`targetR`, in default-texture
 * units): alphaTest = profile alpha at targetR/sf. When that alpha falls
 * outside a usable range (e.g. the tight glow-0.3 tail is already zero
 * there), the threshold clamps and `sizeK` compensates the point size so the
 * disc edge stays put — body solidity must not depend on the glow knob.
 */
export function bodyModeCal(
  look: SpriteLook | null | undefined,
  targetR: number,
  defaultAT: number,
): { alphaTest: number; sizeK: number } {
  if (!look || (look.level === DEFAULT_GLOW_LEVEL && look.h === 0)) {
    return { alphaTest: defaultAT, sizeK: 1 };
  }
  const alphaTest = THREE.MathUtils.clamp(
    profileAlpha(look.level, look.h, targetR / look.sf), 0.05, 0.9,
  );
  const rc = Math.max(crossR(look.level, look.h, alphaTest), 1e-3);
  return { alphaTest, sizeK: targetR / (look.sf * rc) };
}

/** A particle: base local offsets + per-kind extras, written by animal code. */
export interface Particle {
  c: THREE.Color;
  [k: string]: unknown;
}

export interface WorldCtx {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sprite: THREE.CanvasTexture;
}

export interface PointCloud {
  geo: THREE.BufferGeometry;
  pos: Float32Array;
  mat: THREE.PointsMaterial;
  points: THREE.Points;
  N: number;
}

/** Build a Points cloud from a particle list (colors baked once). */
export function makePoints(
  world: WorldCtx,
  P: Particle[],
  { size = 0.065, opacity = 0.85 }: { size?: number; opacity?: number } = {},
): PointCloud {
  const N = P.length;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    col[i * 3] = P[i].c.r;
    col[i * 3 + 1] = P[i].c.g;
    col[i * 3 + 2] = P[i].c.b;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size,
    map: world.sprite,
    vertexColors: true,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false; // bounds are never recomputed — culling would clip
  world.scene.add(points);
  return { geo, pos, mat, points, N };
}

// ---------------------------------------------------------------------------
// Body render modes — selectable density treatments for the animal cloud.
//
// The shipped look ('glow') is additive blending + depthWrite:false: every
// sprite adds light, so far-side particles shine straight through the body
// and the creature reads as translucent. The alternatives below trade that
// luminosity for solidity in different ways; /lab/ocean previews them and
// the Hero keeps 'glow' until one is deliberately chosen.
//
// All modes mutate/augment the SAME PointCloud the animal writes into every
// frame, so simulation code stays untouched:
//   'opaque'    — normal blending + depthWrite + alphaTest: hard discs that
//                 occlude each other via the depth buffer.
//   'core-glow' — two passes over one geometry: opaque core discs (slightly
//                 smaller) + an additive halo pass on top.
//   'spheres'   — the Points cloud is hidden and an InstancedMesh of
//                 low-poly spheres is synced from the same position buffer.
// ---------------------------------------------------------------------------

export type BodyRenderMode = 'glow' | 'opaque' | 'core-glow' | 'spheres';

export interface BodyModeHandle {
  mode: BodyRenderMode;
  /** Per-frame sync (sphere transforms / halo opacity follow). Cheap for 2D modes. */
  update(): void;
  /** Restore the cloud's stock glow material and remove any extra passes. */
  dispose(): void;
}

/** Snapshot-and-restore of the PointsMaterial fields the modes touch. */
function snapshotMat(mat: THREE.PointsMaterial): () => void {
  const { blending, depthWrite, alphaTest, size, opacity } = mat;
  const color = mat.color.clone();
  return () => {
    mat.blending = blending;
    mat.depthWrite = depthWrite;
    mat.alphaTest = alphaTest;
    mat.size = size;
    mat.opacity = opacity;
    mat.color.copy(color);
    mat.needsUpdate = true;
  };
}

/**
 * Apply a body render mode to an animal cloud. Colors are authored for
 * additive stacking (individually dim, bright in aggregate), so the opaque
 * modes boost the material color multiplier to land in the same perceived
 * brightness range with a single non-additive layer.
 */
export function applyBodyMode(
  world: WorldCtx,
  cloud: PointCloud,
  mode: BodyRenderMode,
  /**
   * The sprite look the cloud currently renders with («Glow» / «Particle size» selection) — opaque/core-glow derive their alphaTest + size
   * compensation from ITS alpha profile; absent = shipped default texture.
   */
  look?: SpriteLook | null,
): BodyModeHandle {
  if (mode === 'glow') {
    return { mode, update: () => {}, dispose: () => {} };
  }

  const mat = cloud.mat;
  const restore = snapshotMat(mat);
  const baseSize = mat.size; // pre-mode base (species × size knob × glow sf)

  if (mode === 'opaque') {
    // hard-edged disc: shipped constant 0.42 cuts the default profile at
    // r = 0.545 — bodyModeCal keeps that world edge for every glow texture
    const cal = bodyModeCal(look, 0.545, 0.42);
    mat.blending = THREE.NormalBlending;
    mat.depthWrite = true;
    mat.alphaTest = cal.alphaTest;
    // bigger discs so the hard cores tile into a closed surface — the stock
    // size was tuned for soft additive sprites whose halos did the filling
    mat.size *= 1.45 * cal.sizeK;
    mat.color.setScalar(2.6); // single-layer compensation for additive-tuned colors
    mat.needsUpdate = true;
    return { mode, update: () => {}, dispose: restore };
  }

  if (mode === 'core-glow') {
    // Pass 1 — the cloud itself becomes the opaque core (writes depth).
    // Shipped 0.55 cuts the default profile at r = 0.404; per-texture cal
    // keeps the core disc size independent of the glow knob.
    const cal = bodyModeCal(look, 0.404, 0.55);
    mat.blending = THREE.NormalBlending;
    mat.depthWrite = true;
    mat.alphaTest = cal.alphaTest;
    mat.size *= 0.78 * cal.sizeK;
    mat.color.setScalar(1.9);
    mat.needsUpdate = true;
    // Pass 2 — additive halo SHARING the geometry (positions sync for free),
    // parented to the Points so it inherits the live tuning scale. Depth test
    // stays on: halos behind the body are hidden by the core's depth writes.
    // The «Glow» knob is a natural fit here: the halo uses the selected
    // glow texture, follows the un-compensated base size (so the sf extent
    // growth applies) and scales its opacity with the continuous knob value.
    const glowK = look?.glow ?? 1;
    const glowMat = new THREE.PointsMaterial({
      size: baseSize * 1.482, // == shipped 0.78 × 1.9 of the base size
      map: look?.tex ?? world.sprite,
      vertexColors: true,
      transparent: true,
      opacity: Math.min(1, mat.opacity * 0.55 * glowK),
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const glow = new THREE.Points(cloud.geo, glowMat);
    glow.frustumCulled = false;
    glow.renderOrder = 1; // draw after the core pass
    cloud.points.add(glow);
    return {
      mode,
      // follow the hero's assemble/scatter opacity fades on the halo too
      update: () => { glowMat.opacity = Math.min(1, mat.opacity * 0.55 * glowK); },
      dispose: () => {
        cloud.points.remove(glow);
        glowMat.dispose(); // geometry is the cloud's own — not ours to dispose
        restore();
      },
    };
  }

  // mode === 'spheres' — fully solid instanced micro-spheres. The «Glow»
  // knob is deliberately a NO-OP here: spheres have no halo, and dividing
  // out the glow size factor keeps their radius pinned to the size knob only.
  const N = cloud.N;
  // radius follows the LIVE base sprite size (species size × «Particle size»)
  // instead of a fixed 0.065 guess — the mode is re-applied on size change
  const radius = (cloud.mat.size / (look?.sf ?? 1)) * 0.45;
  const sphereGeo = new THREE.SphereGeometry(radius, 6, 5);
  const sphereMat = new THREE.MeshLambertMaterial();
  const mesh = new THREE.InstancedMesh(sphereGeo, sphereMat, N);
  mesh.frustumCulled = false;
  // bake per-instance colors from the cloud's color attribute (boosted — the
  // palette is additive-tuned and a lit opaque surface renders it once)
  const colAttr = cloud.geo.getAttribute('color');
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    c.setRGB(colAttr.getX(i), colAttr.getY(i), colAttr.getZ(i)).multiplyScalar(1.6);
    mesh.setColorAt(i, c);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  // identity rotation/scale once; per-frame updates rewrite translation only
  const im = mesh.instanceMatrix.array as Float32Array;
  for (let i = 0; i < N; i++) {
    const b = i * 16;
    im[b] = 1; im[b + 5] = 1; im[b + 10] = 1; im[b + 15] = 1;
  }
  // the scene is unlit (Points ignore lights) — spheres need light to read
  // as volumes; scoped to this mode and removed with it
  const hemi = new THREE.HemisphereLight(0xcfe4f2, 0x0a1420, 2.2);
  const dir = new THREE.DirectionalLight(0xffffff, 1.4);
  dir.position.set(2.5, 3.5, 4);
  world.scene.add(hemi, dir, mesh);
  cloud.points.visible = false; // keep simulation writing, stop drawing sprites
  return {
    mode,
    update: () => {
      const pos = cloud.pos;
      for (let i = 0; i < N; i++) {
        const b = i * 16;
        im[b + 12] = pos[i * 3];
        im[b + 13] = pos[i * 3 + 1];
        im[b + 14] = pos[i * 3 + 2];
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.scale.copy(cloud.points.scale); // follow live Size tuning
    },
    dispose: () => {
      world.scene.remove(mesh, hemi, dir);
      mesh.dispose();
      sphereGeo.dispose();
      sphereMat.dispose();
      cloud.points.visible = true;
      restore();
    },
  };
}

// scratch state for applyColorGrade — module-level, zero per-call allocation
const gradeC = new THREE.Color();
const gradeHSL = { h: 0, s: 0, l: 0 };

/**
 * Rewrite a cloud's color attribute from a PRISTINE copy through an HSL
 * transform («Hue»/«Saturation»/«Brightness» knobs). Called only when a
 * knob value CHANGES — never per-frame — so the original palette (seams,
 * spot patterns, gradients) is preserved exactly and repeated edits never
 * accumulate drift. Identity values restore the original bytes verbatim.
 */
export function applyColorGrade(
  cloud: PointCloud,
  orig: Float32Array,
  hueDeg: number,
  sat: number,
  bright: number,
): void {
  const attr = cloud.geo.getAttribute('color') as THREE.BufferAttribute;
  const arr = attr.array as Float32Array;
  if (hueDeg === 0 && sat === 1 && bright === 1) {
    arr.set(orig);
    attr.needsUpdate = true;
    return;
  }
  const dh = hueDeg / 360;
  for (let i = 0; i < cloud.N; i++) {
    gradeC.setRGB(orig[i * 3], orig[i * 3 + 1], orig[i * 3 + 2]);
    gradeC.getHSL(gradeHSL);
    gradeC.setHSL(
      (((gradeHSL.h + dh) % 1) + 1) % 1,
      THREE.MathUtils.clamp(gradeHSL.s * sat, 0, 1),
      THREE.MathUtils.clamp(gradeHSL.l * bright, 0, 1),
    );
    arr[i * 3] = gradeC.r;
    arr[i * 3 + 1] = gradeC.g;
    arr[i * 3 + 2] = gradeC.b;
  }
  attr.needsUpdate = true;
}

/** Write one particle's world position from local (lx side, ly fwd, lz up). */
export function place(
  pos: Float32Array,
  i: number,
  head: THREE.Vector3,
  dir: THREE.Vector3,
  side: THREE.Vector3,
  up: THREE.Vector3,
  lx: number,
  ly: number,
  lz: number,
): void {
  pos[i * 3] = head.x + dir.x * ly + side.x * lx + up.x * lz;
  pos[i * 3 + 1] = head.y + dir.y * ly + side.y * lx + up.y * lz;
  pos[i * 3 + 2] = head.z + dir.z * ly + side.z * lx + up.z * lz;
}

/**
 * Continuity-stabilized "side" basis vector.
 *
 * The naive `side = worldUp × dir` flips sign the instant `dir` crosses the
 * vertical pole — the whole rendered body mirrors in one frame (the "instant
 * turn" bug). This keeps a persistent side vector: each frame it is
 * parallel-transported against the new dir (never jumps), then rotated toward
 * the true horizon-aligned side at a bounded angular rate (the fish rights
 * itself smoothly instead of teleporting).
 */
export class BasisSmoother {
  readonly side = new THREE.Vector3(0, 0, 1);
  private ref = new THREE.Vector3();
  private crossT = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(dir?: THREE.Vector3) {
    if (dir) {
      this.ref.crossVectors(this.up, dir);
      if (this.ref.lengthSq() > 1e-6) this.side.copy(this.ref).normalize();
    }
  }

  /** Advance toward the upright basis for `dir`; `rate` = rad/s of righting. */
  update(dir: THREE.Vector3, dt: number, rate = 3.0): THREE.Vector3 {
    // parallel transport: strip the dir component, keep continuity
    this.side.addScaledVector(dir, -this.side.dot(dir));
    if (this.side.lengthSq() < 1e-6) this.side.set(0, 0, 1).addScaledVector(dir, -dir.z).normalize();
    else this.side.normalize();
    // right toward the true horizontal side at a bounded rate (no sign snap)
    this.ref.crossVectors(this.up, dir);
    if (this.ref.lengthSq() > 1e-4) {
      this.ref.normalize();
      const cosA = THREE.MathUtils.clamp(this.side.dot(this.ref), -1, 1);
      const sinA = this.crossT.crossVectors(this.side, this.ref).dot(dir);
      const ang = Math.atan2(sinA, cosA);
      const step = THREE.MathUtils.clamp(ang, -rate * dt, rate * dt);
      if (Math.abs(step) > 1e-5) {
        this.q.setFromAxisAngle(dir, step);
        this.side.applyQuaternion(this.q).normalize();
      }
    }
    return this.side;
  }
}

/**
 * Cursor projector: pointer NDC → 3D point on the camera-facing plane
 * through the scene origin. `set(ndcX, ndcY)` from pointer events;
 * `update()` each frame returns the projected point.
 */
export class CursorTarget {
  readonly point = new THREE.Vector3(1.5, 0.4, 0);
  hasMouse = false;
  private ndc = new THREE.Vector2(0.3, 0.15);
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane();
  private camDir = new THREE.Vector3();
  private hit = new THREE.Vector3();
  private origin = new THREE.Vector3(0, 0, 0);

  set(x: number, y: number): void {
    this.ndc.set(x, y);
    this.hasMouse = true;
  }

  update(camera: THREE.PerspectiveCamera): THREE.Vector3 {
    camera.getWorldDirection(this.camDir);
    this.plane.setFromNormalAndCoplanarPoint(this.camDir, this.origin);
    this.ray.setFromCamera(this.ndc, camera);
    if (this.ray.ray.intersectPlane(this.plane, this.hit)) this.point.copy(this.hit);
    return this.point;
  }
}

/**
 * Ambient water — reconstruction of the prototypes' `attachWater(scene)`:
 * dim drifting motes in a large volume, slow rise + sideways wander.
 * Returns an update function; caller disposes via returned handle.
 */
export function attachWater(world: WorldCtx): {
  update: (dt: number, time: number) => void;
  dispose: () => void;
} {
  const N = 360;
  const P: Particle[] = [];
  for (let i = 0; i < N; i++) {
    const c = new THREE.Color(0x9fc4d8).multiplyScalar(0.05 + Math.random() * 0.09);
    P.push({ c });
  }
  const cloud = makePoints(world, P, { size: 0.05, opacity: 0.5 });
  const seed = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    seed[i * 4] = (Math.random() - 0.5) * 12; // x
    seed[i * 4 + 1] = (Math.random() - 0.5) * 8; // y
    seed[i * 4 + 2] = (Math.random() - 0.5) * 7 - 1.5; // z (bias behind)
    seed[i * 4 + 3] = Math.random() * Math.PI * 2; // phase
  }
  function update(_dt: number, time: number): void {
    const pos = cloud.pos;
    for (let i = 0; i < N; i++) {
      const ph = seed[i * 4 + 3];
      // slow rise with wraparound + gentle sideways sway
      const y = ((seed[i * 4 + 1] + time * 0.07 + 4) % 8) - 4;
      pos[i * 3] = seed[i * 4] + Math.sin(time * 0.11 + ph) * 0.35;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = seed[i * 4 + 2] + Math.cos(time * 0.09 + ph * 1.7) * 0.3;
    }
    cloud.geo.attributes.position.needsUpdate = true;
  }
  return {
    update,
    dispose: () => {
      world.scene.remove(cloud.points);
      cloud.geo.dispose();
      cloud.mat.dispose();
    },
  };
}
