/**
 * ShaderHero — fullscreen WebGL plane with an animated noise+gradient shader.
 * Reacts to time + cursor. Uses raw three.js imperative API to avoid
 * R3F JSX-intrinsic typing issues.
 *
 * When `palette` is supplied (from OceanHero via Hero), the shader colours
 * lerp toward the animal's palette on each frame (60fps uniform update).
 * The lerp is gated by `prefers-reduced-motion`: under reduce-motion the
 * palette switches instantly on the next (single) render frame.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { themeColors } from '@/lib/design/tokens';

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const frag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2  uResolution;
  uniform vec3  uAccent;
  uniform vec3  uC0;
  uniform vec3  uC1;
  uniform vec3  uC2;

  vec2 hash(vec2 p){
    p = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }
  float noise(in vec2 p){
    const float K1 = 0.366025404;
    const float K2 = 0.211324865;
    vec2 i = floor(p + (p.x+p.y)*K1);
    vec2 a = p - i + (i.x+i.y)*K2;
    vec2 o = (a.x>a.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);
    vec2 b = a - o + K2;
    vec2 c = a - 1.0 + 2.0*K2;
    vec3 h = max(0.5-vec3(dot(a,a), dot(b,b), dot(c,c)), 0.0);
    vec3 n = h*h*h*h*vec3(dot(a,hash(i)), dot(b,hash(i+o)), dot(c,hash(i+1.0)));
    return dot(n, vec3(70.0));
  }
  float fbm(vec2 p) {
    float v = 0.0; float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.02; a *= 0.5;
    }
    return v;
  }

  // 0..1 value remaps of the shared simplex noise, for the ray field below.
  float vn(vec2 p) { return 0.5 + 0.5 * noise(p); }
  float fbm01(vec2 p) {
    float v = 0.0; float a = 0.5;
    for (int i = 0; i < 3; i++) { v += a * vn(p); p *= 2.02; a *= 0.5; }
    return v;
  }

  // Surface light shafts («God rays») — same closed-form field as
  // the uw-kelp scenes: a fan of beams from a fixed sun above the frame,
  // swinging on a ~35s period, dissolving down the water column. Deliberately
  // no pointer term — the water belongs to the surface, not the cursor.
  float rayLight(vec2 p, float t) {
    vec2 sun = vec2(0.0, 1.55);
    vec2 toSun = sun - p;
    float d = length(toSun);
    float theta = atan(toSun.x, toSun.y);
    float swing = 0.16 * sin(t * 0.18) + 0.06 * sin(t * 0.071 + 2.0);
    float rays1 = vn(vec2((theta + swing) * 9.0, d * 0.6 - t * 0.045));
    float rays2 = vn(vec2((theta - swing * 0.6) * 17.0 + 40.0, d * 0.9 - t * 0.07));
    float shafts = pow(rays1, 2.6) * 0.85 + pow(rays2, 3.2) * 0.55;
    float depthFade = exp(-max(1.0 - p.y, 0.0) * 2.2);
    float haze = mix(0.55, 1.1, fbm01(p * 1.4 + vec2(t * 0.03, -t * 0.02)));
    return shafts * depthFade * haze;
  }

  void main() {
    vec2 uv = vUv;
    vec2 p = uv - 0.5;
    p.x *= uResolution.x / uResolution.y;

    // The backdrop drifts on its own clock only — no cursor coupling.
    vec2 q = p + vec2(uTime * 0.04, uTime * 0.02);

    float n = fbm(q * 1.6);
    n += 0.5 * fbm(q * 3.4 + n);

    // c0/c1/c2 are driven by uniform lerps (per-animal palette from CreatureHero)
    float t = smoothstep(-0.6, 0.9, n);
    vec3 col = mix(uC0, uC1, smoothstep(0.0, 0.4, t));
    col = mix(col, uC2, smoothstep(0.45, 0.78, t));
    col = mix(col, uAccent * 0.35, smoothstep(0.88, 1.0, t));

    // Light shafts ride on top of the palette clouds, tinted by the palette's
    // own bright water color so they follow each animal's mood.
    vec3 rayCol = mix(uC2, vec3(1.0), 0.35);
    col += rayCol * rayLight(vec2(p.x, uv.y), uTime) * 0.6;

    float vig = smoothstep(1.3, 0.3, length(p));
    col *= 0.55 + 0.65 * vig;

    col += (sin(uv.y * 800.0 + uTime * 0.7) * 0.5 + 0.5) * 0.012;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export interface ShaderHeroPalette {
  c0: [number, number, number];
  c1: [number, number, number];
  c2: [number, number, number];
  accent: [number, number, number];
}

export function ShaderHero({
  className,
  palette,
}: {
  className?: string;
  palette?: ShaderHeroPalette | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Keep a stable ref so the animation loop can read the latest palette
  // without being re-mounted every time the animal changes.
  const paletteRef = useRef<ShaderHeroPalette | null | undefined>(palette);
  paletteRef.current = palette;

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    const mqReduced = window.matchMedia('(prefers-reduced-motion: reduce)');

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    // Decoration must never take down the page: WebGL may be unavailable
    // (GPU-blocklisted browsers, battery saver, headless) — bail to no shader.
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: false,
        powerPreference: 'high-performance',
      });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Default (jellyfish-ish) fallback palette — will be overridden immediately
    // if palette prop is set.
    const DEF_C0 = [0.02, 0.02, 0.025] as [number, number, number];
    const DEF_C1 = [0.08, 0.08, 0.10] as [number, number, number];
    const DEF_C2 = [0.18, 0.18, 0.12] as [number, number, number];

    const uniforms = {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uAccent: { value: new THREE.Vector3(...themeColors().accent.glsl) },
      uC0: { value: new THREE.Vector3(...DEF_C0) },
      uC1: { value: new THREE.Vector3(...DEF_C1) },
      uC2: { value: new THREE.Vector3(...DEF_C2) },
    };

    const material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms,
      depthWrite: false,
    });
    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h, false);
      uniforms.uResolution.value.set(w, h);
    };
    resize();
    container.appendChild(renderer.domElement);

    Object.assign(renderer.domElement.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      display: 'block',
    });

    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // No mousemove listener by design: the backdrop must not react to the
    // cursor (owner directive 2026-08-06 — "the backdrop does not react to cursor movement"), matching the uw-kelp scene precedent.

    // Lerp speed for palette transitions: ~2s half-life at 60fps.
    const PALETTE_LERP = 0.035;

    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      uniforms.uTime.value = t;

      // Palette coupling: smoothly lerp shader uniforms toward the current
      // animal's background palette. Under prefers-reduced-motion the lerp
      // factor is 1 (instant snap) so there is no animated transition.
      const pal = paletteRef.current;
      if (pal) {
        const lf = mqReduced.matches ? 1 : PALETTE_LERP;
        const lerp = (cur: number, tgt: number) => cur + (tgt - cur) * lf;
        const u0 = uniforms.uC0.value, u1 = uniforms.uC1.value, u2 = uniforms.uC2.value, ua = uniforms.uAccent.value;
        u0.set(lerp(u0.x, pal.c0[0]), lerp(u0.y, pal.c0[1]), lerp(u0.z, pal.c0[2]));
        u1.set(lerp(u1.x, pal.c1[0]), lerp(u1.y, pal.c1[1]), lerp(u1.z, pal.c1[2]));
        u2.set(lerp(u2.x, pal.c2[0]), lerp(u2.y, pal.c2[1]), lerp(u2.z, pal.c2[2]));
        ua.set(lerp(ua.x, pal.accent[0]), lerp(ua.y, pal.accent[1]), lerp(ua.z, pal.accent[2]));
      }

      renderer.render(scene, camera);
      raf = mqReduced.matches
        ? 0 // freeze a single frame for reduced-motion users
        : requestAnimationFrame(tick);
    };
    tick();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className={`pointer-events-none absolute inset-0 -z-10 ${className ?? ''}`}
    />
  );
}
