/*!
 * particle-ocean · https://github.com/ekazanec/particle-ocean
 * Copyright (c) 2026 Andrey Gurov · https://agurov.com
 * MIT licensed. If you ship something built on this, a link back is appreciated.
 */
/**
 * «Glowing garden» — bioluminescent deep-garden biome (ocean/flora.ts spec).
 *
 * GEOMETRY: feathers, not sticks. Sea pens (kind 0) are a bare curved
 * peduncle opening into a pinnate rachis — chevron barb rows rising
 * outward, their length following a seeded feather envelope (short at the
 * base and tip, longest mid-stalk). Sea whips (kind 1) are sinuous tapered
 * stalks studded with polyp beads and a curled tip. Pitch-black floor
 * mounds (kind 2) root the garden. Every parameter is seeded per instance.
 *
 * MOTION: ghostly — the slowest biome. A ~30 s lean plus a faint traveling
 * ripple, |coef| ≤ 0.22. The LIGHT is the animation here: a soft
 * bioluminescent pulse travels UP each stalk on its own 7–13 s period
 * (with a dark phase between pulses), barbs flaring just after the rachis
 * as the wave passes. Pulse brightness is capped (0.18 < 60/255) — the
 * darkness discipline holds even at pulse peaks. No pointer input exists.
 *
 * ATMOSPHERE: near-black abyss (see hero-uw-biolum-garden). The pens sit
 * pale-grey ghostly against it; between pulses the garden almost vanishes.
 */
import type { BiomeSeed, BiomeSpec, FloraStrand } from '@/components/motion/ocean/flora';

const BEND_GLSL = /* glsl */ `
  float biomeBend(float t, float phase, float rootX, float stiff, float kind, float yy) {
    if (kind > 1.5) return 0.0; // mounds are still
    float s2 = yy * yy;
    // ghostly: a ~30 s lean + a faint upward-traveling ripple
    return 0.16 * sin(0.21 * t + phase) * s2
         + 0.06 * sin(0.45 * t - 1.6 * yy + 2.0 * phase) * s2;
  }
`;

/** TS mirror of biomeBend — MUST stay formula-identical (proof rects). */
function bendCoef(t: number, phase: number, _rootX: number, _stiff: number, kind: number, yy: number): number {
  if (kind > 1.5) return 0;
  const s2 = yy * yy;
  return 0.16 * Math.sin(0.21 * t + phase) * s2
       + 0.06 * Math.sin(0.45 * t - 1.6 * yy + 2.0 * phase) * s2;
}

const FRAG = /* glsl */ `
  void main() {
    vec2 q = vec2((vUv.x - 0.5) * vRatio, vUv.y);
    float yy = vUv.y;
    vec3 col;
    // per-instance pulse clock: period 7–13 s, ~37% of it dark
    float T = 7.0 + 6.0 * fract(vSeed * 3.7);
    float front = fract(uTime / T + vPhase * 0.159) * 1.6 - 0.3;
    if (vKind > 1.5) {
      // abyssal mound: pitch-black dome
      float u = abs(q.x) * (2.2 / vRatio);
      float dome = (1.0 - u * u) * (0.55 + 0.30 * vnoise(vec2(q.x * 5.0 + vSeed * 17.0, vSeed * 9.0)));
      if (yy > max(dome, 0.0)) discard;
      col = vTint * uShift * (0.35 + 0.20 * yy);
    } else if (vKind > 0.5) {
      // sea whip: sinuous tapered stalk, polyp beads, curled tip
      float curl = smoothstep(0.72, 1.0, yy);
      float cx = 0.20 * sin(yy * 2.2 + vSeed * 6.28) * yy
               + 0.06 * sin(yy * 11.0 + vSeed * 12.0) * curl;
      float bead = step(0.78, fract(yy * 22.0 + vSeed * 7.0));
      float wI = mix(0.020, 0.006, yy) * (1.0 + 0.9 * bead);
      if (abs(q.x - cx) > wI || yy > 0.98) discard;
      col = vTint * uShift * (0.55 + 0.35 * yy);
      // the pulse climbs the whip and flares each bead it passes
      float band = exp(-pow((yy - front) * 7.0, 2.0));
      col += uGlint * band * (0.35 + 0.75 * bead);
    } else {
      // ---- sea pen: bare peduncle + pinnate feather ----
      float cx = 0.05 * sin(yy * 2.4 + vSeed * 6.28) * yy;
      float X = q.x - cx;
      float stemW = mix(0.045, 0.012, yy);
      bool rachis = abs(X) < stemW && yy < 0.985;
      bool barb = false;
      if (yy > 0.30) {
        float Y = yy - 0.30;
        // feather envelope: short at base and tip, longest mid-stalk
        float env = sin(3.14159265 * clamp(Y / 0.70, 0.0, 1.0));
        float Lb = (0.16 + 0.08 * fract(vSeed * 7.0)) * pow(env, 0.7);
        float nb = 26.0 + 12.0 * fract(vSeed * 3.3);
        float tilt = 0.6 + 0.25 * fract(vSeed * 5.1);
        // chevron barb rows rising outward from the rachis
        float fr = fract((Y - abs(X) * tilt) * nb);
        barb = fr < 0.45 && abs(X) < Lb && abs(X) > stemW * 0.6;
      }
      if (!rachis && !barb) discard;
      // ghostly pale base — barely-there against the abyss
      col = vTint * uShift * (0.55 + 0.35 * yy);
      if (barb) col *= 0.9;
      // bioluminescence travels up the rachis; barbs flare slightly later
      float band = exp(-pow((yy - front) * 6.0, 2.0));
      float lagged = exp(-pow((yy - front + abs(X) * 0.35) * 6.0, 2.0));
      col += uGlint * ((rachis ? 0.9 : 0.0) * band + (barb ? 0.7 : 0.0) * lagged);
    }
    gl_FragColor = vec4(biomeFinish(col), 1.0);
  }
`;

function layout(ctx: Parameters<BiomeSpec['layout']>[0]): BiomeSeed[] {
  const seeds: BiomeSeed[] = [];
  const cam = ctx.cam;
  // pens + whips: sparse — the abyss garden must stay lonely
  const bands = [
    { band: 'far' as const, pens: 6, whips: 2, z0: -6.4, z1: -4.8, gap: 0, tint: [0.020, 0.024, 0.030] as [number, number, number] },
    { band: 'mid' as const, pens: 4, whips: 2, z0: -3.0, z1: 2.8, gap: 0.32, tint: [0.016, 0.019, 0.024] as [number, number, number] },
    { band: 'near' as const, pens: 3, whips: 1, z0: 3.5, z1: 5.2, gap: 0.30, tint: [0.011, 0.013, 0.017] as [number, number, number] },
  ];
  for (const b of bands) {
    const [z0, z1] = ctx.zRange(b.z0, b.z1);
    const place = (kind: 0 | 1, n: number): void => {
      for (let i = 0; i < n; i++) {
        const z = z0 + (z1 - z0) * Math.random();
        const hh = ctx.hh(z);
        const hw = ctx.hw(z);
        let x = cam.position.x - hw + ((i + 0.15 + Math.random() * 0.7) / n) * 2 * hw;
        if (b.gap > 0 && Math.abs(x - cam.position.x) < b.gap * hw) {
          x += Math.sign(x - cam.position.x || 1) * (b.gap + 0.05) * hw;
        }
        const rootY = ctx.bottom(z) - Math.random() * 0.2;
        const h = hh * (kind === 0 ? 0.60 + Math.random() * 0.40 : 0.7 + Math.random() * 0.45);
        // deep-garden cap: tips ≤ ~60% of the viewport
        const hMax = cam.position.y + 0.16 * hh - rootY;
        const shade = 0.85 + Math.random() * 0.3;
        seeds.push({
          x, y: rootY, z, h,
          w: h * (kind === 0 ? 0.5 : 0.28),
          sway: Math.min(0.08 * h, 0.4),
          hMax,
          phase: Math.random() * Math.PI * 2,
          stiff: 0.6 + Math.random() * 0.8,
          seed: Math.random(),
          kind,
          tint: [b.tint[0] * shade, b.tint[1] * shade, b.tint[2] * shade],
          band: b.band,
        });
      }
    };
    place(0, b.pens);
    place(1, b.whips);
  }
  // pitch-black floor mounds: far + near full-width, two lone humps
  const mounds = [
    { band: 'far' as const, z: -6.7, wk: 2.15, xo: 0, hk: 0.34 },
    { band: 'far' as const, z: -5.6, wk: 0.6, xo: 0.5, hk: 0.38 },
    { band: 'mid' as const, z: 0.2, wk: 0.5, xo: -0.6, hk: 0.34 },
    { band: 'near' as const, z: 4.9, wk: 2.15, xo: 0, hk: 0.45 },
  ];
  for (const m of mounds) {
    const [, z] = ctx.zRange(m.z - 0.2, m.z);
    const hh = ctx.hh(z);
    const hw = ctx.hw(z);
    seeds.push({
      x: cam.position.x + m.xo * hw,
      y: ctx.bottom(z) - 0.02 * hh,
      z,
      h: hh * m.hk,
      w: hw * m.wk,
      sway: 0, hMax: hh * 2,
      phase: Math.random() * Math.PI * 2, stiff: 1, seed: Math.random(),
      kind: 2, tint: [0.004, 0.005, 0.008], band: m.band,
    });
  }
  return seeds;
}

export const BIOLUM_BIOME: BiomeSpec = {
  id: 'biolum',
  segments: 16,
  cap: 0.18, // pulse peaks stay below the sensor threshold (60/255 ≈ 0.235)
  layout,
  bendGlsl: BEND_GLSL,
  bendCoef,
  fragGlsl: FRAG,
  palette: {
    ref: [0.016, 0.019, 0.024],
    glint: [0.10, 0.22, 0.24], // pale-cyan bioluminescence
    fog: 0x05070c,
  },
  proof: {
    // peduncle below the feather (yy < 0.30): taper minus max curve (0.05·yy)
    0: {
      yyMax: 0.25,
      maskHalf: (yy: number, s: FloraStrand) => Math.max(0.045 - 0.083 * yy, 0) * s.eh * 0.9,
      slack: (yyLo: number, yyHi: number) => 0.22 * (yyHi * yyHi - yyLo * yyLo) + 0.10 * yyHi * yyHi,
    },
    // whips are too thin for the 10-px gate — no proof (ok:false)
    // abyssal mound: dome solid for yy ≤ 0.42 within |x| ≤ 0.22·w (worst
    // noise factor 0.55: u² ≤ 1 − 0.42/0.55), static
    2: {
      yyMax: 0.42,
      maskHalf: (_yy: number, s: FloraStrand) => 0.20 * s.ew,
      slack: () => 0,
    },
  },
};
