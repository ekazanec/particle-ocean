/**
 * UnderwaterShader — shared host for the hero-uw-* underwater background set
 * (ocean lab, /lab/ocean). One fullscreen THREE quad + a fragment shader per
 * effect; this file owns the house-pattern plumbing so each hero-uw-* file is
 * only its shader:
 *
 * - uniforms: uTime (s), uRes (drawing-buffer px), uMouse (0..1, y-up, lerped);
 * - optional base-plate texture (`textureUrl`): loaded async into uTex with
 *   uTexAspect (w/h) + uTexReady (0→1) — art-plate shaders (uw-coral-canyon-art)
 *   sample it as their base layer; shaders that ignore it are unaffected;
 * - pointermove on `window` (the element is pointer-events-none and sits UNDER
 *   the creature layer in /lab/ocean — element-level events never fire there);
 * - dpr capped at 1.75, antialias off, high-performance context;
 * - prefers-reduced-motion → renders exactly one static frame (no rAF loop);
 * - ResizeObserver keeps uRes honest; full dispose on unmount.
 *
 * UW_GLSL_LIB carries the common hash/noise/fbm helpers + uniform declarations
 * so the 12 shaders don't re-declare them.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { ShaderHeroPalette } from './shader-hero';

/**
 * Noise-only chunk (no uniform declarations) — shared with materials OUTSIDE
 * this host, e.g. the in-scene kelp flora samples the same ray field as the
 * uw-kelp backdrop and needs identical vnoise/fbm without inheriting the
 * quad shader's uniform block.
 */
export const UW_NOISE_GLSL = /* glsl */ `
  float hash12(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  vec2 hash22(vec2 p) {
    float n = sin(dot(p, vec2(41.0, 289.0)));
    return fract(vec2(262144.0, 32768.0) * n);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * vnoise(p);
      p = p * 2.03 + vec2(17.3, 9.1);
      a *= 0.5;
    }
    return v;
  }

  float fbm3(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
      v += a * vnoise(p);
      p = p * 2.11 + vec2(11.7, 5.3);
      a *= 0.5;
    }
    return v;
  }
`;

export const UW_GLSL_LIB = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec2 uRes;
  uniform vec2 uMouse;
  // per-animal palette (registry bg), lerped by the host — unused uniforms
  // are stripped by the GLSL compiler in shaders that ignore them
  uniform vec3 uC0;
  uniform vec3 uC1;
  uniform vec3 uC2;
  uniform vec3 uAccent;

${UW_NOISE_GLSL}

  // Static blue-noise-ish dither to kill banding in the dark gradients.
  vec3 uwDither() {
    return vec3(hash12(gl_FragCoord.xy) * 0.004 - 0.002);
  }
`;

const VERT = /* glsl */ `
  void main() { gl_Position = vec4(position, 1.0); }
`;

// Neutral defaults for the per-animal palette uniforms — the standalone
// green-sea look of the merged kelp scene. Shaders that don't reference
// uC0…uAccent are unaffected by the extra uniforms.
const DEF_PAL: ShaderHeroPalette = {
  c0: [0.008, 0.018, 0.016],
  c1: [0.010, 0.026, 0.020],
  c2: [0.020, 0.062, 0.075],
  accent: [0.30, 0.65, 0.60],
};

export function UnderwaterShader({
  frag,
  className,
  palette,
  textureUrl,
}: {
  frag: string;
  className?: string;
  /**
   * Current animal's background palette (registry `bg`, same object
   * ShaderHero receives). Shaders may reference uC0/uC1/uC2/uAccent to
   * adapt their mood per animal; uniforms lerp on change like ShaderHero's
   * (instant under reduced motion). Absent → the DEF_PAL neutral look.
   */
  palette?: ShaderHeroPalette | null;
  /**
   * Optional base-plate image for art-piece backdrops. Loaded into `uTex`
   * (sampler2D) with `uTexAspect` (w/h) and `uTexReady` (0 until decoded).
   * Loaded texture keeps its raw sRGB bytes (no colorSpace decode) so the
   * shader's direct writes reproduce the artwork 1:1. Under reduced motion
   * the single static frame is re-rendered once the texture arrives.
   */
  textureUrl?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const palRef = useRef<ShaderHeroPalette | null | undefined>(palette);
  palRef.current = palette;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let w = el.clientWidth || window.innerWidth;
    let h = el.clientHeight || Math.round(window.innerHeight * 0.9);

    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 1.75);
    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h);
    Object.assign(renderer.domElement.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      display: 'block',
    });
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const cam = new THREE.Camera();
    const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
    const pal0 = palRef.current ?? DEF_PAL;
    const uniforms = {
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(buf.x, buf.y) },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uC0: { value: new THREE.Vector3(...pal0.c0) },
      uC1: { value: new THREE.Vector3(...pal0.c1) },
      uC2: { value: new THREE.Vector3(...pal0.c2) },
      uAccent: { value: new THREE.Vector3(...pal0.accent) },
      uTex: { value: null as THREE.Texture | null },
      uTexAspect: { value: 2.0 },
      uTexReady: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: frag,
      uniforms,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    scene.add(quad);

    // Base-plate texture (art backdrops). Raw sRGB bytes on purpose: the uw
    // shaders write gl_FragColor directly (no three.js output transform), so
    // sampling undecoded values reproduces the source artwork exactly.
    let plate: THREE.Texture | null = null;
    let disposed = false;
    if (textureUrl) {
      new THREE.TextureLoader().load(textureUrl, (t) => {
        if (disposed) { t.dispose(); return; }
        t.wrapS = THREE.ClampToEdgeWrapping;
        t.wrapT = THREE.ClampToEdgeWrapping;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.magFilter = THREE.LinearFilter;
        t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        plate = t;
        uniforms.uTex.value = t;
        const img = t.image as { width: number; height: number };
        uniforms.uTexAspect.value = img.width / img.height;
        uniforms.uTexReady.value = 1;
        // reduced motion renders exactly one frame — redo it with the plate
        if (reduce) render();
      });
    }

    const mouseTarget = new THREE.Vector2(0.5, 0.5);
    const mouseCurrent = new THREE.Vector2(0.5, 0.5);
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      mouseTarget.set(
        (e.clientX - rect.left) / Math.max(w, 1),
        1 - (e.clientY - rect.top) / Math.max(h, 1),
      );
    };
    // Window-level: the container is pointer-events-none under the creature layer.
    window.addEventListener('pointermove', onMove, { passive: true });

    // ABSOLUTE page clock (not mount-relative): the in-scene kelp flora
    // lights its blades with the SAME ray field as the uw-kelp backdrop and
    // lives on a different canvas with its own mount time — a shared t0 = 0
    // is the only way both evaluate the field at an identical phase. The
    // other uw shaders only ever use uTime differentially, so for them this
    // is a pure phase offset.
    let raf = 0;
    const PALETTE_LERP = 0.035; // ~2 s half-life at 60 fps, as in ShaderHero
    const palScratch = new THREE.Vector3();
    const lerpPal = (u: THREE.Vector3, tgt: [number, number, number], lf: number) => {
      u.lerp(palScratch.set(tgt[0], tgt[1], tgt[2]), lf);
    };
    const render = () => {
      uniforms.uTime.value = performance.now() / 1000;
      mouseCurrent.lerp(mouseTarget, 0.04);
      uniforms.uMouse.value.copy(mouseCurrent);
      const pal = palRef.current;
      if (pal) {
        const lf = reduce ? 1 : PALETTE_LERP;
        lerpPal(uniforms.uC0.value, pal.c0, lf);
        lerpPal(uniforms.uC1.value, pal.c1, lf);
        lerpPal(uniforms.uC2.value, pal.c2, lf);
        lerpPal(uniforms.uAccent.value, pal.accent, lf);
      }
      renderer.render(scene, cam);
      if (!reduce) raf = requestAnimationFrame(render);
    };
    render();

    const ro = new ResizeObserver(() => {
      w = el.clientWidth || window.innerWidth;
      h = el.clientHeight || Math.round(window.innerHeight * 0.9);
      renderer.setSize(w, h);
      const b = renderer.getDrawingBufferSize(new THREE.Vector2());
      uniforms.uRes.value.set(b.x, b.y);
      if (reduce) render();
    });
    ro.observe(el);

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      quad.geometry.dispose();
      plate?.dispose();
      mat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
    };
  }, [frag, textureUrl]);

  return (
    <div
      ref={ref}
      aria-hidden
      className={`pointer-events-none absolute inset-0 -z-10 ${className ?? ''}`}
    />
  );
}
