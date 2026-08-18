/**
 * «Kelp cathedral» — giant-kelp cathedral biome (ocean/flora.ts spec).
 *
 * GEOMETRY (the 2026-07-30 "sticks" rejection is the reason this file
 * exists): a kelp plant here is NOT a ribbon. Each instance is a sinuous
 * tapered stipe carrying 4–6 fronds; every frond is a pneumatocyst (gas
 * bladder, drawn as a small bulb with a lit rim) plus a ruffled leaf blade
 * streaming off it at a seeded angle — the recognizable Macrocystis
 * silhouette. Holdfast mounds and two full-width seafloor strips root the
 * forest on a visible dark bottom. Every shape parameter is seeded per
 * instance: no two plants share a silhouette.
 *
 * MOTION: majestic slow surge — two incommensurate swells (T ≈ 18 s / 11.4 s)
 * traveling across the forest in world x, cantilever-anchored (zero at the
 * holdfast, yy² accumulation), tips trailing the base by ~1–2 s via retarded
 * time. |coef| ≤ 1.36 < 1.4 (occlusion bound). No pointer term exists.
 *
 * ATMOSPHERE: cool green-blue; the blades sit near-silhouette and are made
 * readable by the SAME god-ray field the «Kelp cathedral» backdrop renders
 * (KELP_RAY_GLSL, single GLSL source, shared absolute clock) — beams sweep
 * the 3D fronds in exact sync with the 2D shafts behind them.
 */
import { KELP_RAY_GLSL } from '@/components/motion/hero-uw-kelp';
import type { BiomeSeed, BiomeSpec, FloraStrand } from '@/components/motion/ocean/flora';

const BEND_GLSL = /* glsl */ `
  float bioGust(float t, float x) {
    // two incommensurate SLOW swells traveling +x: T ≈ 18 s and 11.4 s
    return 0.5 + 0.5 * (0.60 * sin(0.35 * t - 0.30 * x)
                      + 0.40 * sin(0.55 * t - 0.21 * x + 1.7));
  }
  float biomeBend(float t, float phase, float rootX, float stiff, float kind, float yy) {
    if (kind > 0.5) return 0.0; // holdfast mounds and the seafloor are still
    float s2 = yy * yy;
    float lag = 0.5 + 0.8 / stiff; // tips trail the base by ~1-2 s
    float g = bioGust(t - lag * yy, rootX);
    return (0.50 + 0.55 * g) * (0.70 + 0.30 / stiff) * s2
         + 0.10 * sin(0.30 * t - 2.0 * yy + 0.5 * phase) * s2;
  }
`;

/** TS mirror of biomeBend — MUST stay formula-identical (proof rects). */
function bendCoef(t: number, phase: number, rootX: number, stiff: number, kind: number, yy: number): number {
  if (kind > 0.5) return 0;
  const s2 = yy * yy;
  const lag = 0.5 + 0.8 / stiff;
  const tr = t - lag * yy;
  const g = 0.5 + 0.5 * (0.60 * Math.sin(0.35 * tr - 0.30 * rootX)
                       + 0.40 * Math.sin(0.55 * tr - 0.21 * rootX + 1.7));
  return (0.50 + 0.55 * g) * (0.70 + 0.30 / stiff) * s2
       + 0.10 * Math.sin(0.30 * t - 2.0 * yy + 0.5 * phase) * s2;
}

const FRAG = /* glsl */ `
${KELP_RAY_GLSL}
  void main() {
    // isotropic local coords: x in units of element height (aspect-corrected)
    vec2 q = vec2((vUv.x - 0.5) * vRatio, vUv.y);
    float yy = vUv.y;
    vec3 col;
    if (vKind > 1.5) {
      // seafloor strip: rolling dark relief across the full width
      float ground = 0.35 + 0.45 * fbm3(vec2(q.x * 2.2 + vSeed * 31.0, vSeed * 7.0));
      if (yy > ground) discard;
      col = vTint * uShift * 0.5;
      col += uGlint * 0.06 * smoothstep(ground - 0.10, ground, yy); // crest rim
    } else if (vKind > 0.5) {
      // holdfast mound
      float u = abs(q.x) * (2.2 / vRatio);
      float dome = (1.0 - u * u) * (0.55 + 0.30 * vnoise(vec2(q.x * 5.0 + vSeed * 17.0, vSeed * 9.0)));
      if (yy > max(dome, 0.0)) discard;
      col = vTint * uShift * (0.45 + 0.25 * yy);
    } else {
      // ---- giant kelp: stipe + pneumatocysts + ruffled leaf blades ----
      // stipe: seeded static S-curve (motion belongs to the vertex bend —
      // animated edge shimmer was part of the rejected look), thin taper
      float cx = (0.03 * sin(yy * 2.6 + vSeed * 6.28) + 0.02 * sin(yy * 6.1 + vSeed * 12.6)) * yy;
      float sw = mix(0.034, 0.012, yy);
      bool stipe = abs(q.x - cx) < sw && yy < 0.97;
      float bladeD = 1e3;   // signed-ish: <0 inside a blade
      float bladeRim = 0.0; // edge shade of the blade that owns the pixel
      float bulb = -1.0;    // pneumatocyst radial coordinate (1 center → 0 rim)
      for (int i = 0; i < 6; i++) {
        float fi = float(i);
        float ya = 0.22 + fi * 0.13 + 0.05 * fract(vSeed * 7.0 + fi * 0.37);
        if (ya > 0.92) break;
        // alternating sides with a seeded flip
        float sgn = mix(1.0, -1.0, step(0.5, fract(fi * 0.5 + vSeed * 3.0)));
        vec2 d = q - vec2(cx, ya);
        d.x *= sgn; // fold to the +x side
        // pneumatocyst: a small gas bulb right at the stipe
        float rb = 0.020 + 0.012 * fract(vSeed * 13.0 + fi * 0.71);
        vec2 bc = vec2(sw + rb * 0.8, 0.0);
        float db = length(d - bc);
        if (db < rb) bulb = max(bulb, 1.0 - db / rb);
        // ruffled leaf blade streaming off the bulb at a seeded angle
        float lift = mix(-0.45, 0.40, fract(vSeed * 5.0 + fi * 0.53));
        vec2 dir = normalize(vec2(1.0, lift));
        vec2 o = d - (bc + dir * rb * 0.8);
        float u2 = dot(o, dir);
        float v2 = dot(o, vec2(-dir.y, dir.x));
        float L = 0.13 + 0.08 * fract(vSeed * 11.0 + fi * 0.29);
        if (u2 > 0.0 && u2 < L) {
          float tL = u2 / L;
          // leaf profile: pointed at both ends, ruffled STATIC edge
          float wv = (0.030 + 0.020 * fract(vSeed * 23.0 + fi * 0.61))
                   * pow(sin(3.14159265 * tL), 0.6);
          wv *= 0.80 + 0.20 * sin(u2 * 90.0 + vSeed * 40.0 + fi * 9.0);
          float dd = abs(v2) - wv;
          if (dd < bladeD) {
            bladeD = dd;
            bladeRim = smoothstep(-wv * 0.5, 0.0, dd);
          }
        }
      }
      bool blade = bladeD < 0.0;
      bool bladder = bulb > 0.0;
      if (!stipe && !blade && !bladder) discard;
      // NEAR-SILHOUETTE base color: dark hue-shifted greens; the shared ray
      // sweep makes the forest readable, not its own brightness
      col = vTint * uShift * (0.50 + 0.30 * yy);
      if (stipe && !blade && !bladder) col *= 0.85; // stipe reads darker
      if (blade) col *= 1.08 + 0.10 * bladeRim;     // faint lighter leaf edge
      if (bladder) {
        // bulb: darker core, thin lit rim — the recognizable float
        col *= 0.9;
        col += uGlint * 0.14 * smoothstep(0.45, 0.05, bulb);
      }
    }
    // Sun beams light the biome: multiplicative lift + a palette glint from
    // the SHARED field (same GLSL, same absolute clock as the backdrop).
    vec2 scr = biomeScreen();
    float rayL = kelpRayLight(vec2(scr.x * uAspect, scr.y), uAspect, uRayT);
    col *= 1.0 + 2.6 * rayL;
    col += uGlint * rayL * 0.55;
    gl_FragColor = vec4(biomeFinish(col), 1.0);
  }
`;

function layout(ctx: Parameters<BiomeSpec['layout']>[0]): BiomeSeed[] {
  const seeds: BiomeSeed[] = [];
  const cam = ctx.cam;
  const bands = [
    { band: 'far' as const, n: 7, z0: -6.6, z1: -4.6, tint: [0.012, 0.034, 0.026] as [number, number, number], gap: 0 },
    { band: 'mid' as const, n: 4, z0: -3.2, z1: 3.0, tint: [0.008, 0.020, 0.015] as [number, number, number], gap: 0.35 },
    { band: 'near' as const, n: 3, z0: 3.6, z1: 5.4, tint: [0.004, 0.010, 0.008] as [number, number, number], gap: 0.28 },
  ];
  for (const b of bands) {
    const [z0, z1] = ctx.zRange(b.z0, b.z1);
    for (let i = 0; i < b.n; i++) {
      const z = z0 + (z1 - z0) * Math.random();
      const hh = ctx.hh(z);
      const hw = ctx.hw(z);
      // jittered uniform spread; center-stage keep-out (mid/near): the
      // actor's home area must not be permanently blocked
      let x = cam.position.x - hw + ((i + 0.15 + Math.random() * 0.7) / b.n) * 2 * hw;
      if (b.gap > 0 && Math.abs(x - cam.position.x) < b.gap * hw) {
        x += Math.sign(x - cam.position.x || 1) * (b.gap + 0.05) * hw;
      }
      const rootY = ctx.bottom(z) - Math.random() * 0.25;
      // cathedral columns: tall — but the tip stays under ~70% viewport
      const h = hh * (0.9 + Math.random() * 0.5);
      const hMax = cam.position.y + 0.4 * hh - rootY;
      const shade = 0.85 + Math.random() * 0.3;
      seeds.push({
        x, y: rootY, z, h,
        w: h * 0.8, // fronds fan wide of the stipe — the plane must hold them
        sway: Math.min(0.10 * h, 0.7),
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
  // holdfast mounds — dark rounded relief between the columns
  const mounds = [
    { band: 'far' as const, n: 3, z: -6.2, tint: [0.008, 0.018, 0.014] as [number, number, number] },
    { band: 'near' as const, n: 2, z: 4.8, tint: [0.003, 0.007, 0.006] as [number, number, number] },
  ];
  for (const m of mounds) {
    const [, z] = ctx.zRange(m.z - 0.2, m.z);
    const hh = ctx.hh(z);
    const hw = ctx.hw(z);
    for (let i = 0; i < m.n; i++) {
      const x = ctx.cam.position.x - hw + ((i + 0.2 + Math.random() * 0.6) / m.n) * 2 * hw;
      const h = hh * (0.42 + Math.random() * 0.18);
      seeds.push({
        x, y: ctx.bottom(z) - 0.04 * h, z, h,
        w: hh * (0.8 + Math.random() * 0.5),
        sway: 0, hMax: h * 2,
        phase: Math.random() * Math.PI * 2, stiff: 1, seed: Math.random(),
        kind: 1, tint: m.tint, band: m.band,
      });
    }
  }
  // seafloor strips — the visible dark bottom band at two depths
  for (const g of [
    { band: 'far' as const, z: -6.8, tint: [0.006, 0.014, 0.011] as [number, number, number] },
    { band: 'near' as const, z: 5.0, tint: [0.003, 0.006, 0.005] as [number, number, number] },
  ]) {
    const [, z] = ctx.zRange(g.z - 0.2, g.z);
    const hh = ctx.hh(z);
    seeds.push({
      x: ctx.cam.position.x, y: ctx.bottom(z) - 0.06 * hh, z,
      h: hh * 0.30, w: ctx.hw(z) * 2.15,
      sway: 0, hMax: hh,
      phase: 0, stiff: 1, seed: Math.random(),
      kind: 2, tint: g.tint, band: g.band,
    });
  }
  return seeds;
}

export const KELP_BIOME: BiomeSpec = {
  id: 'kelp',
  segments: 24,
  cap: 0.14,
  layout,
  bendGlsl: BEND_GLSL,
  bendCoef,
  fragGlsl: FRAG,
  palette: {
    ref: [0.008, 0.02, 0.015],
    glint: [0.085, 0.18, 0.13],
    fog: 0x07090f,
  },
  proof: {
    // stipe base band, below the first frond attachment (ya ≥ 0.22): solid
    // within the taper minus the max static S-curve excursion (0.05·yy)
    0: {
      yyMax: 0.19,
      maskHalf: (yy: number, s: FloraStrand) => Math.max(0.034 - 0.072 * yy, 0) * s.eh * 0.92,
      // bend envelope (max |coef| ≈ 1.36·yy²) across the band + latency
      slack: (yyLo: number, yyHi: number) => 1.36 * (yyHi * yyHi - yyLo * yyLo) + 0.25 * yyHi * yyHi,
    },
    // holdfast mound: dome solid for yy ≤ 0.42 within |x| ≤ 0.22·w (worst
    // noise factor 0.55: u² ≤ 1 − 0.42/0.55), static
    1: {
      yyMax: 0.42,
      maskHalf: (_yy: number, s: FloraStrand) => 0.20 * s.ew,
      slack: () => 0,
    },
    // seafloor strips are rooted deep below the frame edge — their visible
    // band is noise-carved, not guaranteed → not proofable (ok:false)
  },
};
