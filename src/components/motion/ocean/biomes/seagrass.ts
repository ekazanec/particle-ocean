/*!
 * particle-ocean · https://github.com/ekazanec/particle-ocean
 * Copyright (c) 2026 Andrey Gurov · https://agurov.com
 * MIT licensed. If you ship something built on this, a link back is appreciated.
 */
/**
 * «Eelgrass meadow» — seagrass-meadow biome (ocean/flora.ts spec).
 *
 * GEOMETRY: a low carpet, not a forest. ~40 grass clumps (5–8 thin tapered
 * blades fanning out of a small sand hummock, every blade with its own
 * seeded lean/curve/length) plus ~20 taller single blades — ≈280 individual
 * blades across three depth bands — over rippled sand-dune ridges. Tips stay
 * under ~35% of the viewport: the meadow is deliberately the LOWEST biome.
 *
 * MOTION: a wind-like wave TRAVELING across the meadow (wheat field under
 * water): the bend field's phase runs in world x (λ ≈ 7.4 world units,
 * crest speed ≈ 0.65 u/s), so a crest visibly sweeps the whole carpet left
 * to right; blades add a small per-blade flutter (fragment-side lateral
 * offset that vanishes at the root — the proof band is untouched). |coef|
 * ≤ 1.35 < 1.4. No pointer input exists.
 *
 * ATMOSPHERE: serene bright-ish shallows. Blades are near-silhouette; the
 * SAME caustic-dapple field as the sand behind them (GRASS_CAUSTIC_GLSL,
 * shared source + absolute clock) plays across the meadow.
 */
import { GRASS_CAUSTIC_GLSL } from '@/components/motion/hero-uw-seagrass';
import type { BiomeSeed, BiomeSpec, FloraStrand } from '@/components/motion/ocean/flora';

const BEND_GLSL = /* glsl */ `
  float biomeBend(float t, float phase, float rootX, float stiff, float kind, float yy) {
    if (kind > 1.5) return 0.0; // sand ridges are still
    float s2 = yy * yy;
    float tr = t - 0.35 * yy; // short blades — quick tip lag
    // the traveling meadow wave: spatial phase in WORLD x, crests run +x
    float w1 = sin(0.55 * tr - 0.85 * rootX);
    float w2 = 0.45 * sin(0.90 * tr - 1.35 * rootX + 1.3);
    float g = 0.5 + 0.5 * (w1 + w2) / 1.45;
    return (0.28 + 0.82 * g) * (0.75 + 0.25 / stiff) * s2
         + 0.06 * sin(1.1 * t - 3.0 * yy + phase) * s2;
  }
`;

/** TS mirror of biomeBend — MUST stay formula-identical (proof rects). */
function bendCoef(t: number, phase: number, rootX: number, stiff: number, kind: number, yy: number): number {
  if (kind > 1.5) return 0;
  const s2 = yy * yy;
  const tr = t - 0.35 * yy;
  const w1 = Math.sin(0.55 * tr - 0.85 * rootX);
  const w2 = 0.45 * Math.sin(0.90 * tr - 1.35 * rootX + 1.3);
  const g = 0.5 + 0.5 * (w1 + w2) / 1.45;
  return (0.28 + 0.82 * g) * (0.75 + 0.25 / stiff) * s2
       + 0.06 * Math.sin(1.1 * t - 3.0 * yy + phase) * s2;
}

const FRAG = /* glsl */ `
${GRASS_CAUSTIC_GLSL}
  void main() {
    vec2 q = vec2((vUv.x - 0.5) * vRatio, vUv.y);
    float yy = vUv.y;
    vec3 col;
    float caGain = 1.0;
    if (vKind > 1.5) {
      // sand-dune ridge: rippled crest silhouette, guaranteed solid below
      // 0.26 (the proof band lives there)
      float ridge = 0.34
                  + 0.08 * sin(q.x * (9.0 / vRatio) + vSeed * 20.0)
                  + 0.05 * fbm3(vec2(q.x * (4.0 / vRatio) + vSeed * 29.0, vSeed * 5.0));
      if (yy > ridge) discard;
      col = vTint * uShift * (0.55 + 0.30 * yy / max(ridge, 0.01));
      // ripple marks + dapples playing on the dune crest
      col *= 0.92 + 0.08 * sin(q.x * (60.0 / vRatio) + vSeed * 9.0);
      caGain = 1.6;
    } else {
      // grass: a clump of 5-8 blades out of a hummock (kind 0) or a single
      // taller blade (kind 1) — every blade seeded: own lean, curve, length
      float nb = (vKind > 0.5) ? 1.0 : (6.0 + floor(fract(vSeed * 9.0) * 4.0));
      float hum = (vKind > 0.5) ? 0.0
        : 0.10 * (1.0 - pow(abs(q.x) * (2.0 / vRatio), 2.0))
              * (0.8 + 0.3 * vnoise(vec2(q.x * 6.0, vSeed * 13.0)));
      bool hummock = vKind < 0.5 && yy < max(hum, 0.0);
      float d = 1e3;
      for (int i = 0; i < 8; i++) {
        if (float(i) >= nb) break;
        float fi = float(i);
        float h1 = fract(vSeed * 17.0 + fi * 0.618);
        float h2 = fract(vSeed * 29.0 + fi * 0.383);
        float rx = (nb < 1.5) ? 0.0 : (fi / (nb - 1.0) - 0.5) * 0.12 * vRatio;
        float len = 0.55 + 0.45 * h1;
        if (yy < len) {
          float t2 = yy / len;
          float lean = rx * 2.5 + (h2 - 0.5) * 0.7;
          float curve = (h1 - 0.5) * 1.4;
          // per-blade slow flutter on top of the instance-level wave —
          // zero at the root, so the hummock proof band never moves
          float wob = 0.10 * sin(uTime * 0.7 + vSeed * 37.0 + fi * 2.4) * t2 * t2;
          float cxi = rx + lean * 0.35 * t2 + curve * 0.45 * t2 * t2 + wob;
          // ribbon-like Zostera blade: reads as grass, not wire
          float wI = mix(0.030, 0.007, t2) * (0.8 + 0.5 * h2);
          d = min(d, abs(q.x - cxi) - wI);
        }
      }
      if (!hummock && d > 0.0) discard;
      col = vTint * uShift * (0.60 + 0.40 * yy);
      if (hummock && d > 0.0) col = vTint * uShift * 0.5; // dark sand base
      caGain = 3.0;
    }
    // The SHARED caustic web (same GLSL + absolute clock as the backdrop
    // sand) makes the dark meadow readable.
    vec2 scr = biomeScreen();
    float ca = grassCaustic(vec2(scr.x * uAspect, scr.y), uAspect, uRayT);
    col *= 1.0 + caGain * ca;
    col += uGlint * ca * 0.5;
    gl_FragColor = vec4(biomeFinish(col), 1.0);
  }
`;

function layout(ctx: Parameters<BiomeSpec['layout']>[0]): BiomeSeed[] {
  const seeds: BiomeSeed[] = [];
  const cam = ctx.cam;
  // grass carpet: clumps (kind 0) + taller singles (kind 1); ≈280 blades
  const bands = [
    { band: 'far' as const, z0: -6.4, z1: -4.8, clumps: 16, singles: 8, tint: [0.018, 0.048, 0.032] as [number, number, number] },
    { band: 'mid' as const, z0: -3.0, z1: 2.8, clumps: 14, singles: 8, tint: [0.013, 0.034, 0.023] as [number, number, number] },
    { band: 'near' as const, z0: 3.5, z1: 5.2, clumps: 10, singles: 6, tint: [0.008, 0.018, 0.013] as [number, number, number] },
  ];
  for (const b of bands) {
    const [z0, z1] = ctx.zRange(b.z0, b.z1);
    const place = (kind: 0 | 1, n: number): void => {
      for (let i = 0; i < n; i++) {
        const z = z0 + (z1 - z0) * Math.random();
        const hh = ctx.hh(z);
        const hw = ctx.hw(z);
        // carpet coverage: jittered uniform, NO center keep-out — the
        // meadow is low enough to never block the actor
        const x = cam.position.x - hw + ((i + 0.1 + Math.random() * 0.8) / n) * 2 * hw;
        const rootY = ctx.bottom(z) - Math.random() * 0.15;
        const h = hh * (kind === 0 ? 0.28 + Math.random() * 0.14 : 0.32 + Math.random() * 0.18);
        // the meadow cap: tips ≤ ~35% of the viewport — much lower than any
        // other biome, this is a carpet
        const hMax = cam.position.y - 0.34 * hh - rootY;
        const shade = 0.85 + Math.random() * 0.3;
        seeds.push({
          x, y: rootY, z, h,
          w: h * (kind === 0 ? 1.3 : 0.5),
          sway: Math.min(0.22 * h, 0.35),
          hMax: Math.max(hMax, h * 0.6),
          phase: Math.random() * Math.PI * 2,
          stiff: 0.6 + Math.random() * 0.8,
          seed: Math.random(),
          kind,
          tint: [b.tint[0] * shade, b.tint[1] * shade, b.tint[2] * shade],
          band: b.band,
        });
      }
    };
    place(0, b.clumps);
    place(1, b.singles);
  }
  // sand-dune ridges (kind 2): the visible floor. Far + near full-width,
  // two partial mid dunes for relief between the grass bands.
  const dunes = [
    { band: 'far' as const, z: -6.6, wk: 2.15, xo: 0, tint: [0.030, 0.030, 0.022] as [number, number, number] },
    { band: 'mid' as const, z: -1.5, wk: 0.9, xo: -0.5, tint: [0.024, 0.024, 0.018] as [number, number, number] },
    { band: 'mid' as const, z: 1.8, wk: 0.8, xo: 0.55, tint: [0.020, 0.020, 0.015] as [number, number, number] },
    { band: 'near' as const, z: 4.8, wk: 2.15, xo: 0, tint: [0.014, 0.014, 0.010] as [number, number, number] },
  ];
  for (const dn of dunes) {
    const [, z] = ctx.zRange(dn.z - 0.2, dn.z);
    const hh = ctx.hh(z);
    const hw = ctx.hw(z);
    seeds.push({
      x: cam.position.x + dn.xo * hw,
      y: ctx.bottom(z) - 0.02 * hh,
      z,
      h: hh * 0.85,
      w: hw * dn.wk,
      sway: 0,
      hMax: hh * 2,
      phase: 0, stiff: 1, seed: Math.random(),
      kind: 2, tint: dn.tint, band: dn.band,
    });
  }
  return seeds;
}

export const SEAGRASS_BIOME: BiomeSpec = {
  id: 'seagrass',
  segments: 12, // grass is short — fewer bend segments suffice
  cap: 0.14,
  layout,
  bendGlsl: BEND_GLSL,
  bendCoef,
  fragGlsl: FRAG,
  palette: {
    ref: [0.010, 0.024, 0.018],
    glint: [0.10, 0.20, 0.15],
    fog: 0x07090f,
  },
  proof: {
    // sand-dune ridge: silhouette solid below the worst-case crest
    // (0.34 − 0.08 − 0.0 = 0.26) → guaranteed band up to 0.24; static
    2: {
      yyMax: 0.24,
      maskHalf: (_yy: number, s: FloraStrand) => 0.45 * s.ew,
      slack: () => 0,
    },
    // grass blades/clumps are individually too thin for a guaranteed band —
    // occlusion is still wired (depth-writing + slab resolve), proof rides
    // on the dunes (ok:false for kinds 0/1)
  },
};
