/**
 * «Gorgonian garden» — sea-fan garden biome (ocean/flora.ts spec).
 *
 * GEOMETRY: lace. Each fan is a recursive-looking branch lattice grown in
 * polar coordinates from a short holdfast trunk: seeded main-branch count,
 * a finer dichotomous branch set appearing past mid-radius, wobbled by
 * noise so no spoke is straight, sparse cross-links completing the mesh,
 * all clipped by a seeded fan outline (spread, tilt, rim wobble). Rocky
 * outcrops (craggy seeded profiles, two of them full-width floor strips)
 * ground the garden. Tips stay under ~55% of the viewport.
 *
 * MOTION: gorgonians are STIFF — the whole fan rocks from the holdfast as
 * a near-rigid plate (offset ∝ yy, not yy²), slow (T ≈ 11.4 s), amplitude
 * small (|coef| ≤ 0.42), with a faint flex ripple on top. Rocks are still.
 * No pointer input exists.
 *
 * ATMOSPHERE: tropical night — the fans sit near-silhouette against the
 * violet dark; the SAME warm wandering light field as the backdrop
 * (GORG_LIGHT_GLSL, shared source + absolute clock) grazes them, and tiny
 * seeded polyps shimmer slowly along the branches (capped far below the
 * occlusion sensor threshold).
 */
import { GORG_LIGHT_GLSL } from '@/components/motion/hero-uw-gorgonian';
import type { BiomeSeed, BiomeSpec, FloraStrand } from '@/components/motion/ocean/flora';

const BEND_GLSL = /* glsl */ `
  float biomeBend(float t, float phase, float rootX, float stiff, float kind, float yy) {
    if (kind > 0.5) return 0.0; // rock does not bend
    // near-rigid rocking of the whole fan plate from the holdfast: linear
    // in yy, slight whip toward the rim via a small retarded phase
    float ph = 0.55 * t + 0.4 * phase - 0.35 * yy;
    return 0.32 * sin(ph) * yy * (0.8 + 0.2 * sin(0.13 * t + phase))
         + 0.08 * sin(1.1 * t + 2.0 * phase - 2.5 * yy) * yy * yy;
  }
`;

/** TS mirror of biomeBend — MUST stay formula-identical (proof rects). */
function bendCoef(t: number, phase: number, _rootX: number, _stiff: number, kind: number, yy: number): number {
  if (kind > 0.5) return 0;
  const ph = 0.55 * t + 0.4 * phase - 0.35 * yy;
  return 0.32 * Math.sin(ph) * yy * (0.8 + 0.2 * Math.sin(0.13 * t + phase))
       + 0.08 * Math.sin(1.1 * t + 2.0 * phase - 2.5 * yy) * yy * yy;
}

const FRAG = /* glsl */ `
${GORG_LIGHT_GLSL}
  void main() {
    vec2 q = vec2((vUv.x - 0.5) * vRatio, vUv.y);
    float yy = vUv.y;
    vec3 col;
    if (vKind > 0.5) {
      // rocky outcrop: craggy seeded profile, always grounded
      float u = abs(q.x) * (2.0 / vRatio);
      float prof = (0.40 + 0.35 * fbm3(vec2(q.x * (2.6 / vRatio) + vSeed * 23.0, vSeed * 3.0)))
                 * (1.0 - pow(u, 1.6));
      if (yy > max(prof, 0.0)) discard;
      col = vTint * uShift * (0.45 + 0.20 * yy);
      // crag shadow detail
      col *= 0.85 + 0.15 * vnoise(vec2(q.x * 7.0 + vSeed * 5.0, yy * 7.0));
    } else {
      // ---- sea fan: trunk + polar branch lattice ----
      float cx = 0.04 * sin(yy * 3.0 + vSeed * 6.28) * yy;
      float tw = mix(0.065, 0.030, smoothstep(0.0, 0.3, yy));
      bool trunk = abs(q.x - cx) < tw && yy < 0.30;
      // fan plane above the trunk fork, seeded tilt
      float cxF = 0.04 * sin(0.66 + vSeed * 6.28) * 0.22;
      vec2 f = q - vec2(cxF, 0.22);
      float tilt = (fract(vSeed * 3.1) - 0.5) * 0.5;
      float ct = cos(tilt);
      float st = sin(tilt);
      f = vec2(ct * f.x - st * f.y, st * f.x + ct * f.y);
      float r = length(f);
      float th = atan(f.x, f.y);
      float spread = 0.95 + 0.30 * fract(vSeed * 7.0);
      float rim = cos(clamp(th / spread, -1.5, 1.5));
      float R = 0.62 * (0.55 + 0.45 * rim)
              * (0.85 + 0.25 * vnoise(vec2(th * 2.0 + vSeed * 9.0, vSeed * 4.0)));
      float branch = 0.0;
      float link = 0.0;
      float rn = r / max(R, 1e-3);
      if (r < R && abs(th) < spread * 1.45 && f.y > -0.05 && yy > 0.16) {
        // wobbled radial branches, CURVED by an angular shift growing with
        // radius (rn·1.8) — gorgonian branches arc, they are never straight
        float wob = 0.55 * vnoise(vec2(r * 4.0 + vSeed * 15.0, th * 3.0));
        float K1 = 11.0 + floor(fract(vSeed * 11.0) * 5.0);
        float s1 = abs(sin(th * K1 + wob + rn * 1.8));
        float t1 = mix(0.55, 0.22, rn); // thinner + sparser toward the rim
        branch = step(s1, t1);
        // dichotomous split: a finer set appears past mid-radius
        float s2 = abs(sin(th * K1 * 2.0 + wob * 1.7 + rn * 1.8 + 1.3));
        branch = max(branch, step(s2, t1 * 0.55) * step(0.35, rn));
        // sparse cross-links complete the lace
        float s3 = abs(sin(r * 30.0 + wob * 3.0 + vSeed * 6.0));
        link = step(s3, 0.14) * (1.0 - branch) * step(0.15, rn);
        branch = max(branch, link);
      }
      if (!trunk && branch < 0.5) discard;
      col = vTint * uShift * (0.50 + 0.25 * yy);
      if (trunk && branch < 0.5) col *= 0.85; // holdfast reads darker
      col *= 1.0 - 0.15 * link;               // links thinner/darker than branches
      col += uGlint * 0.10 * rn * step(0.5, branch); // warm-lit fan rim
      // polyp shimmer: tiny seeded dots breathing slowly along the branches
      float sh = hash12(floor(q * 70.0) + floor(vSeed * 90.0));
      float tw2 = 0.5 + 0.5 * sin(uTime * 0.8 + sh * 6.283);
      col += uGlint * step(0.93, sh) * tw2 * 0.30 * step(0.5, branch);
    }
    // The SHARED warm night light (same GLSL + absolute clock as the
    // backdrop) grazes the garden — warm against the violet dark.
    vec2 scr = biomeScreen();
    float glw = gorgLight(vec2(scr.x * uAspect, scr.y), uAspect, uRayT);
    col *= 1.0 + 2.6 * glw;
    col += uGlint * glw * 0.55;
    gl_FragColor = vec4(biomeFinish(col), 1.0);
  }
`;

function layout(ctx: Parameters<BiomeSpec['layout']>[0]): BiomeSeed[] {
  const seeds: BiomeSeed[] = [];
  const cam = ctx.cam;
  // sea fans across three depth bands, warmer/darker toward the camera
  const bands = [
    { band: 'far' as const, n: 5, z0: -6.5, z1: -4.8, gap: 0, tint: [0.030, 0.014, 0.012] as [number, number, number] },
    { band: 'mid' as const, n: 3, z0: -3.0, z1: 2.8, gap: 0.35, tint: [0.022, 0.010, 0.009] as [number, number, number] },
    { band: 'near' as const, n: 2, z0: 3.6, z1: 5.2, gap: 0.30, tint: [0.012, 0.006, 0.006] as [number, number, number] },
  ];
  for (const b of bands) {
    const [z0, z1] = ctx.zRange(b.z0, b.z1);
    for (let i = 0; i < b.n; i++) {
      const z = z0 + (z1 - z0) * Math.random();
      const hh = ctx.hh(z);
      const hw = ctx.hw(z);
      let x = cam.position.x - hw + ((i + 0.15 + Math.random() * 0.7) / b.n) * 2 * hw;
      if (b.gap > 0 && Math.abs(x - cam.position.x) < b.gap * hw) {
        x += Math.sign(x - cam.position.x || 1) * (b.gap + 0.05) * hw;
      }
      const rootY = ctx.bottom(z) - Math.random() * 0.2;
      const h = hh * (0.55 + Math.random() * 0.35);
      // garden cap: fan tips ≤ ~55% of the viewport
      const hMax = cam.position.y + 0.06 * hh - rootY;
      const shade = 0.85 + Math.random() * 0.3;
      seeds.push({
        x, y: rootY, z, h,
        // the fan lattice spreads wide of the trunk: worst-case horizontal
        // extent ≈ R·sin(1.45·spread) ≈ 0.68·h per side → 1.5·h plane
        w: h * 1.5,
        sway: Math.min(0.12 * h, 0.5),
        hMax,
        phase: Math.random() * Math.PI * 2,
        stiff: 0.6 + Math.random() * 0.8,
        seed: Math.random(),
        kind: 0,
        tint: [b.tint[0] * shade, b.tint[1] * shade, b.tint[2] * shade],
        band: b.band,
      });
    }
  }
  // rocky outcrops: full-width floor strips far+near, plus lone rocks
  const rocks = [
    { band: 'far' as const, z: -6.7, wk: 2.15, xo: 0, hk: 0.75, tint: [0.010, 0.008, 0.016] as [number, number, number] },
    { band: 'far' as const, z: -5.8, wk: 0.55, xo: -0.55, hk: 0.50, tint: [0.009, 0.007, 0.014] as [number, number, number] },
    { band: 'mid' as const, z: 0.6, wk: 0.5, xo: 0.6, hk: 0.45, tint: [0.007, 0.006, 0.011] as [number, number, number] },
    { band: 'near' as const, z: 4.9, wk: 2.15, xo: 0, hk: 0.75, tint: [0.005, 0.004, 0.008] as [number, number, number] },
  ];
  for (const rk of rocks) {
    const [, z] = ctx.zRange(rk.z - 0.2, rk.z);
    const hh = ctx.hh(z);
    const hw = ctx.hw(z);
    seeds.push({
      x: cam.position.x + rk.xo * hw,
      y: ctx.bottom(z) - 0.02 * hh,
      z,
      h: hh * rk.hk,
      w: hw * rk.wk,
      sway: 0, hMax: hh * 2,
      phase: Math.random() * Math.PI * 2, stiff: 1, seed: Math.random(),
      kind: 1, tint: rk.tint, band: rk.band,
    });
  }
  return seeds;
}

export const GORGONIA_BIOME: BiomeSpec = {
  id: 'gorgonia',
  segments: 16,
  cap: 0.15,
  layout,
  bendGlsl: BEND_GLSL,
  bendCoef,
  fragGlsl: FRAG,
  palette: {
    ref: [0.020, 0.010, 0.009],
    glint: [0.22, 0.13, 0.07],
    fog: 0x07080f,
  },
  proof: {
    // fan trunk below the fork: taper minus the max static curve (0.04·yy).
    // Often too thin for the 10-px width gate — the rocks are the reliable
    // proof; thin trunks honestly report ok:false via the size check.
    0: {
      yyMax: 0.28,
      maskHalf: (yy: number, s: FloraStrand) => {
        const t = Math.min(Math.max(yy / 0.3, 0), 1);
        const tw = 0.065 - 0.035 * (t * t * (3 - 2 * t));
        return Math.max(tw - 0.04 * yy, 0) * s.eh * 0.9;
      },
      // rigid rock: envelope ∝ yy (max |coef| ≈ 0.42·yy) + latency margin
      slack: (yyLo: number, yyHi: number) => 0.42 * (yyHi - yyLo) + 0.15 * yyHi,
    },
    // rock outcrop: profile solid for yy ≤ 0.30 within |x| ≤ 0.19·w (worst
    // noise factor 0.40: u^1.6 ≤ 1 − 0.30/0.40), static
    1: {
      yyMax: 0.30,
      maskHalf: (_yy: number, s: FloraStrand) => 0.19 * s.ew,
      slack: () => 0,
    },
  },
};
