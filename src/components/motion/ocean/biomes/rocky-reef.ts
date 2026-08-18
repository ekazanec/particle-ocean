/**
 * «Rocky reef» — rocky reef in surge biome (ocean/flora.ts spec).
 *
 * GEOMETRY: stone first. Grounded boulder domes (kind 0) with seeded craggy
 * profiles, flat stratified ledge slabs (kind 1, two of them full-width
 * floor strips), and short scruffy algae tufts (kind 2) rooted IN the
 * boulders' crevices — each tuft a fan of 5–7 uneven curved blades. Rock
 * tops stay under ~40% of the viewport; the tufts are shorter still.
 *
 * MOTION: the surge. Tufts rock strongly but HEAVILY — a ~10 s swell with
 * a sharpened forward stroke (2nd harmonic), tips trailing the base,
 * |coef| ≤ 1.37 < 1.4. The rock itself never moves. The backdrop's
 * suspended particulate advects on the same swell period — one water.
 * No pointer input exists.
 *
 * ATMOSPHERE: moonlit cold — the SAME broad moon-shaft field as the
 * backdrop (REEF_MOON_GLSL, shared source + absolute clock) grazes boulder
 * tops and lights the tufts as they swing through the shafts.
 */
import { REEF_MOON_GLSL } from '@/components/motion/hero-uw-rockreef';
import type { BiomeSeed, BiomeSpec, FloraStrand } from '@/components/motion/ocean/flora';

const BEND_GLSL = /* glsl */ `
  float biomeBend(float t, float phase, float rootX, float stiff, float kind, float yy) {
    if (kind < 1.5) return 0.0; // rock is rock
    // heavy surge: ~10 s swell, sharpened forward stroke, tip lag 1.05 rad
    float ph = 0.62 * t - 1.05 * yy + 0.15 * phase;
    return 0.90 * (sin(ph) + 0.30 * sin(2.0 * ph + 0.9)) * yy * yy * (0.75 + 0.25 / stiff);
  }
`;

/** TS mirror of biomeBend — MUST stay formula-identical (proof rects). */
function bendCoef(t: number, phase: number, _rootX: number, stiff: number, kind: number, yy: number): number {
  if (kind < 1.5) return 0;
  const ph = 0.62 * t - 1.05 * yy + 0.15 * phase;
  return 0.90 * (Math.sin(ph) + 0.30 * Math.sin(2.0 * ph + 0.9)) * yy * yy * (0.75 + 0.25 / stiff);
}

const FRAG = /* glsl */ `
${REEF_MOON_GLSL}
  void main() {
    vec2 q = vec2((vUv.x - 0.5) * vRatio, vUv.y);
    float yy = vUv.y;
    float u = abs(q.x) * (2.0 / vRatio);
    vec3 col;
    float moonGain = 1.6;
    if (vKind < 0.5) {
      // boulder: grounded craggy dome
      float prof = 0.75 * (0.55 + 0.30 * vnoise(vec2(q.x * (1.8 / vRatio) + vSeed * 11.0, vSeed * 5.0))
                         + 0.12 * vnoise(vec2(q.x * (5.0 / vRatio) + vSeed * 23.0, vSeed * 9.0)))
                 * pow(max(1.0 - pow(u, 2.2), 0.0), 0.8);
      if (yy > prof) discard;
      col = vTint * uShift * (0.45 + 0.20 * yy);
      col *= 0.78 + 0.22 * vnoise(vec2(q.x * 6.0 + vSeed * 7.0, yy * 6.0)); // crags
      // moonlit crest: the top of the dome catches the shafts, plus a faint
      // constant top rim so the rock reads even between shaft sweeps
      float crest = smoothstep(0.55, 0.98, yy / max(prof, 1e-3));
      moonGain = 1.4 + 3.0 * crest;
      col += uGlint * 0.08 * crest;
    } else if (vKind < 1.5) {
      // ledge: flat stratified slab
      float prof = (0.30 + 0.10 * fbm3(vec2(q.x * (1.5 / vRatio) + vSeed * 19.0, vSeed * 3.0)))
                 * (1.0 - pow(u, 3.0));
      if (yy > max(prof, 0.0)) discard;
      col = vTint * uShift * (0.45 + 0.15 * yy);
      col *= 0.88 + 0.12 * sin(yy * 30.0 + vSeed * 9.0); // strata
      moonGain = 1.2 + 1.6 * smoothstep(0.5, 0.95, yy / max(prof, 1e-3));
    } else {
      // algae tuft: scruffy fan of uneven curved blades out of a crevice
      float nb = 5.0 + floor(fract(vSeed * 9.0) * 3.0);
      bool base = yy < 0.06 && abs(q.x) < 0.10;
      float d = 1e3;
      for (int i = 0; i < 7; i++) {
        if (float(i) >= nb) break;
        float fi = float(i);
        float h1 = fract(vSeed * 17.0 + fi * 0.618);
        float h2 = fract(vSeed * 29.0 + fi * 0.383);
        float rx = (fi / (nb - 1.0) - 0.5) * 0.14 * vRatio;
        float len = 0.40 + 0.50 * h1;
        if (yy < len) {
          float t2 = yy / len;
          float lean = rx * 3.0 + (h2 - 0.5) * 1.2;
          float curve = (h1 - 0.5) * 1.6;
          float cxi = rx + lean * 0.35 * t2 + curve * 0.35 * t2 * t2;
          float wI = mix(0.032, 0.007, t2) * (0.7 + 0.7 * h2);
          d = min(d, abs(q.x - cxi) - wI);
        }
      }
      if (!base && d > 0.0) discard;
      col = vTint * uShift * (0.50 + 0.35 * yy);
      if (base && d > 0.0) col *= 0.8;
      moonGain = 2.6;
    }
    // The SHARED moonlight (same GLSL + absolute clock as the backdrop).
    vec2 scr = biomeScreen();
    float ml = reefMoon(vec2(scr.x * uAspect, scr.y), uAspect, uRayT);
    col *= 1.0 + moonGain * ml;
    col += uGlint * ml * 0.45;
    gl_FragColor = vec4(biomeFinish(col), 1.0);
  }
`;

function layout(ctx: Parameters<BiomeSpec['layout']>[0]): BiomeSeed[] {
  const seeds: BiomeSeed[] = [];
  const cam = ctx.cam;
  interface Placed { x: number; y: number; z: number; h: number; w: number; band: FloraStrand['band'] }
  const boulders: Placed[] = [];
  const bands = [
    { band: 'far' as const, n: 4, z0: -6.6, z1: -5.0, gap: 0, tint: [0.012, 0.016, 0.024] as [number, number, number] },
    { band: 'mid' as const, n: 2, z0: -3.0, z1: 2.6, gap: 0.40, tint: [0.009, 0.012, 0.018] as [number, number, number] },
    { band: 'near' as const, n: 2, z0: 3.6, z1: 5.2, gap: 0.35, tint: [0.005, 0.007, 0.011] as [number, number, number] },
  ];
  for (const b of bands) {
    const [z0, z1] = ctx.zRange(b.z0, b.z1);
    for (let i = 0; i < b.n; i++) {
      const z = z0 + (z1 - z0) * Math.random();
      const hh = ctx.hh(z);
      const hw = ctx.hw(z);
      let x = cam.position.x - hw + ((i + 0.2 + Math.random() * 0.6) / b.n) * 2 * hw;
      if (b.gap > 0 && Math.abs(x - cam.position.x) < b.gap * hw) {
        x += Math.sign(x - cam.position.x || 1) * (b.gap + 0.05) * hw;
      }
      const rootY = ctx.bottom(z) - 0.03 * hh;
      const h = hh * (0.42 + Math.random() * 0.22);
      // reef cap: boulder tops ≤ ~40% of the viewport
      const hMax = cam.position.y - 0.24 * hh - rootY;
      const shade = 0.85 + Math.random() * 0.3;
      const w = hh * (1.0 + Math.random() * 0.6);
      seeds.push({
        x, y: rootY, z, h, w,
        sway: 0,
        hMax: Math.max(hMax, h * 0.7),
        phase: Math.random() * Math.PI * 2, stiff: 1, seed: Math.random(),
        kind: 0,
        tint: [b.tint[0] * shade, b.tint[1] * shade, b.tint[2] * shade],
        band: b.band,
      });
      boulders.push({ x, y: rootY, z, h, w, band: b.band });
    }
  }
  // ledges: two full-width floor slabs + one offset shelf
  const ledges = [
    { band: 'far' as const, z: -6.7, wk: 2.15, xo: 0, tint: [0.008, 0.011, 0.017] as [number, number, number] },
    { band: 'mid' as const, z: 1.4, wk: 0.7, xo: -0.55, tint: [0.007, 0.009, 0.014] as [number, number, number] },
    { band: 'near' as const, z: 4.9, wk: 2.15, xo: 0, tint: [0.004, 0.006, 0.009] as [number, number, number] },
  ];
  for (const l of ledges) {
    const [, z] = ctx.zRange(l.z - 0.2, l.z);
    const hh = ctx.hh(z);
    const hw = ctx.hw(z);
    seeds.push({
      x: cam.position.x + l.xo * hw,
      y: ctx.bottom(z) - 0.02 * hh,
      z,
      h: hh * 0.50,
      w: hw * l.wk,
      sway: 0, hMax: hh * 2,
      phase: Math.random() * Math.PI * 2, stiff: 1, seed: Math.random(),
      kind: 1, tint: l.tint, band: l.band,
    });
  }
  // algae tufts in the crevices: 1-2 per boulder, SAME z as their rock so
  // the binary occlusion resolve always moves rock and tuft to the same
  // side of the creature slab — they can never be split apart
  for (const bl of boulders) {
    const n = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const hh = ctx.hh(bl.z);
      const h = hh * (0.20 + Math.random() * 0.14);
      seeds.push({
        x: bl.x + (Math.random() - 0.5) * 0.5 * bl.w,
        y: bl.y + bl.h * 0.28, // rooted inside the crevice line
        z: bl.z,
        h,
        w: h * 1.3,
        sway: Math.min(0.28 * h, 0.4),
        hMax: h * 1.2,
        phase: Math.random() * Math.PI * 2,
        stiff: 0.6 + Math.random() * 0.8,
        seed: Math.random(),
        kind: 2,
        tint: [0.014, 0.022, 0.017],
        band: bl.band,
      });
    }
  }
  return seeds;
}

export const REEF_BIOME: BiomeSpec = {
  id: 'reef',
  segments: 12,
  cap: 0.15,
  layout,
  bendGlsl: BEND_GLSL,
  bendCoef,
  fragGlsl: FRAG,
  palette: {
    ref: [0.009, 0.012, 0.018],
    glint: [0.14, 0.19, 0.26], // cold moonlight
    fog: 0x070a12,
  },
  proof: {
    // boulder: grounded dome solid for yy ≤ 0.32 within |x| ≤ 0.25·w
    // (worst noise factor 0.75·0.55 ≈ 0.41: u^2.2 ≤ 1 − (0.32/0.41)^1.25),
    // static
    0: {
      yyMax: 0.32,
      maskHalf: (_yy: number, s: FloraStrand) => 0.25 * s.ew,
      slack: () => 0,
    },
    // ledge slab: solid for yy ≤ 0.28 within |x| ≤ 0.18·w (flat-top 0.30:
    // u³ ≤ 1 − 0.28/0.30), static
    1: {
      yyMax: 0.28,
      maskHalf: (_yy: number, s: FloraStrand) => 0.18 * s.ew,
      slack: () => 0,
    },
    // tufts are small and scruffy — no guaranteed band (ok:false)
  },
};
