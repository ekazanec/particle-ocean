/*!
 * particle-ocean · https://github.com/ekazanec/particle-ocean
 * Copyright (c) 2026 Andrey Gurov · https://agurov.com
 * MIT licensed. If you ship something built on this, a link back is appreciated.
 */
/**
 * HeroUwKelp — «Kelp cathedral»: the 2D backdrop of the giant-kelp biome
 * (2026-07-30 biome redo; the previous single-ribbon «Kelp forest» look
 * was rejected — "you just stuffed it with sticks"). The in-scene half of the biome lives
 * in ocean/biomes/kelp-cathedral.ts; this canvas paints what's behind it:
 *
 * - lower band — LAYERED far kelp silhouettes with the recognizable
 *   Macrocystis anatomy (sinuous stipe, pneumatocyst bulbs, leaf blades
 *   streaming off them), plus a dark canopy blotch band where distant
 *   fronds gather, heights capped ≤ ~62% of the frame;
 * - upper region — volumetric god-ray shafts swinging slowly, dissolving
 *   downward into the water column;
 * - bottom — seabed shadow rooting the scene.
 *
 * Colors are PALETTE-ADAPTIVE: the host lerps uC0/uC1/uC2/uAccent to the
 * active animal's registry bg palette, while blades stay dark silhouettes.
 *
 * KELP_RAY_GLSL is the single closed-form source of the ray-intensity field:
 * the in-scene 3D kelp samples the IDENTICAL function at each fragment's
 * screen position, on the shared absolute page clock, so beams sweep across
 * the real fronds in exact sync with this backdrop. The field deliberately
 * takes no mouse input, and neither does anything else in this scene — the
 * forest belongs to the water only (uMouse is not referenced).
 */
import { UnderwaterShader, UW_GLSL_LIB } from './hero-uw-shader';
import type { ShaderHeroPalette } from './shader-hero';

/**
 * Shared ray-intensity field (needs UW_NOISE_GLSL / UW_GLSL_LIB in scope).
 * `p` — aspect-corrected screen uv (x·aspect, y up), `t` — ABSOLUTE page
 * seconds (performance.now()/1000). Returns beam light ≥ 0 (typically ≤ .4
 * in the kelp band — beams dissolve toward the seabed).
 */
export const KELP_RAY_GLSL = /* glsl */ `
  float kelpRayLight(vec2 p, float aspect, float t) {
    // Sun above the frame, fixed at center — no pointer term by design.
    vec2 sun = vec2(aspect * 0.5, 1.55);
    vec2 toSun = sun - p;
    float d = length(toSun);
    float theta = atan(toSun.x, toSun.y);
    // Whole fan swings slowly (~35 s period) like the surface rolling above.
    float swing = 0.16 * sin(t * 0.18) + 0.06 * sin(t * 0.071 + 2.0);
    float rays1 = vnoise(vec2((theta + swing) * 9.0, d * 0.6 - t * 0.045));
    float rays2 = vnoise(vec2((theta - swing * 0.6) * 17.0 + 40.0, d * 0.9 - t * 0.07));
    float shafts = pow(rays1, 2.6) * 0.85 + pow(rays2, 3.2) * 0.55;
    // Rays live near the top and dissolve into the water column.
    float depthFade = exp(-max(1.0 - p.y, 0.0) * 2.6);
    // Volumetric haze drifting through the beams (3 octaves — the 4th is
    // invisible at these luminances and the field runs per-fragment on TWO
    // canvases, backdrop and blade lighting).
    float haze = mix(0.55, 1.1, fbm3(p * 1.4 + vec2(t * 0.03, -t * 0.02)));
    return shafts * depthFade * haze;
  }
`;

const FRAG = /* glsl */ `
${UW_GLSL_LIB}
${KELP_RAY_GLSL}

  // One giant kelp per grid column; returns silhouette mask. Heights capped
  // (tips ≤ ~0.62 of the frame). Anatomy echoes the in-scene biome: thin
  // stipe + pneumatocyst bulbs + leaf blades — not a bare ribbon. Motion is
  // the same stately-surge family as the biome's vertex bend (two slow
  // swells T ≈ 18/11.4 s traveling along the forest, tips retarded), and
  // there is deliberately NO pointer term anywhere in this scene.
  float kelpLayer(vec2 p, float cells, float seed, float t, float swayAmp) {
    float gx = p.x * cells + seed;
    float id = floor(gx);
    float fx = fract(gx) - 0.5;
    vec2 rnd = hash22(vec2(id, seed));
    if (rnd.x < 0.25) return 0.0; // gaps in the forest

    float hgt = 0.30 + rnd.y * 0.32;            // tips ≤ ~0.62 of frame
    float phase = rnd.x * 6.283;
    float yn = clamp(p.y / hgt, 0.0, 1.0);      // 0 holdfast → 1 tip
    float tr = t - 1.1 * yn;                    // tip lags the base
    float g = 0.5 + 0.5 * (0.60 * sin(0.35 * tr - 0.9 * id)
                         + 0.40 * sin(0.55 * tr - 0.63 * id + 1.7));
    float bend = ((0.50 + 0.55 * g)
                + 0.10 * sin(0.30 * t - 2.0 * yn + 0.5 * phase)) * swayAmp * yn * yn;
    // stipe: thin, with a STATIC seeded S-curve (no animated edge shimmer)
    float cx = bend + (0.05 * sin(yn * 2.6 + phase) + 0.03 * sin(yn * 6.1 + phase * 2.0)) * yn * 0.4;
    float sw = mix(0.020, 0.008, yn) * (0.8 + rnd.y * 0.4);
    float blade = smoothstep(sw, sw * 0.5, abs(fx - cx));
    // fronds: bulb + leaf pairs climbing the stipe, alternating sides
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float ya = (0.24 + fi * 0.26 + 0.06 * fract(phase + fi * 0.37)) * hgt;
      float sgn = mix(1.0, -1.0, step(0.5, fract(fi * 0.5 + rnd.x * 3.0)));
      vec2 d = vec2((fx - cx) * sgn, p.y - ya);
      // pneumatocyst bulb
      float rb = 0.014 + 0.008 * fract(phase * 1.7 + fi);
      blade = max(blade, smoothstep(rb, rb * 0.5, length(d - vec2(sw + rb, 0.0))));
      // leaf: squashed ellipse streaming out-down from the bulb
      vec2 o = d - vec2(sw + rb * 2.2, -0.01);
      float L = 0.05 + 0.03 * fract(phase * 2.3 + fi * 0.7);
      float e = length(vec2(o.x / L, o.y / (L * 0.34)) - vec2(0.5, 0.0));
      blade = max(blade, smoothstep(1.0, 0.7, e) * step(0.0, o.x));
    }
    blade *= smoothstep(hgt, hgt * 0.72, p.y);  // taper out at the tip
    return clamp(blade, 0.0, 1.0);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    float aspect = uRes.x / uRes.y;
    vec2 p = vec2(uv.x * aspect, uv.y);

    // Water: palette-adaptive — deep/light tones lean toward the active
    // animal's palette, keeping a green-sea base (cathedral cool).
    vec3 deep = mix(vec3(0.008, 0.018, 0.016), uC0 * 1.15, 0.6);
    vec3 lightWater = mix(vec3(0.020, 0.062, 0.075), uC2 * 1.25, 0.6);
    vec3 col = mix(deep, lightWater, pow(uv.y, 1.4));

    // God-rays: the SHARED field + a soft root glow around the sun.
    float ray = kelpRayLight(p, aspect, uTime);
    vec2 sun = vec2(aspect * 0.5, 1.55);
    float sunD = length(sun - p);
    vec3 rayCol = mix(vec3(0.16, 0.34, 0.34), uAccent * 0.7 + uC2 * 0.8, 0.55);
    col += rayCol * ray * 0.55;
    col += rayCol * 0.5 * exp(-sunD * 1.35) * 0.8;

    // Layered depth canopy: dark frond-mass blotches where the far forest
    // gathers below the light — reads as the cathedral vault.
    float canopy = fbm3(vec2(p.x * 1.6, p.y * 3.0 + 7.0));
    float canopyBand = smoothstep(0.30, 0.52, uv.y) * smoothstep(0.68, 0.52, uv.y);
    vec3 canopyCol = mix(vec3(0.010, 0.028, 0.022), uC1 * 0.8, 0.35);
    col = mix(col, canopyCol, smoothstep(0.55, 0.8, canopy) * canopyBand * 0.55);

    // Kelp silhouettes shift temperature toward the palette's mid tone.
    vec3 farCol = mix(vec3(0.012, 0.034, 0.026), uC1, 0.35);
    vec3 midColK = mix(vec3(0.008, 0.020, 0.015), uC1 * 0.7, 0.35);
    vec3 nearCol = mix(vec3(0.004, 0.010, 0.008), uC0 * 0.7, 0.35);

    // Far layer — swallowed by haze.
    float far = kelpLayer(vec2(p.x, p.y), 7.0, 11.0, uTime, 0.10);
    col = mix(col, mix(col, farCol, 0.75), far);

    // Mid layer.
    float mid = kelpLayer(vec2(p.x, p.y * 1.02), 4.5, 47.0, uTime * 1.06, 0.13);
    col = mix(col, midColK, mid * 0.9);

    // Near layer — bold, almost black.
    float near = kelpLayer(vec2(p.x, p.y * 1.05), 2.6, 83.0, uTime * 1.12, 0.16);
    col = mix(col, nearCol, near);
    col += mix(vec3(0.03, 0.08, 0.06), uC2, 0.4) * near * (1.0 - near) * pow(uv.y, 1.5) * 0.6;

    // Seabed: rolling holdfast-mound skyline + shadow root the cathedral.
    float mound = 0.035 + 0.05 * fbm3(vec2(p.x * 2.4 + 3.0, 2.0));
    col = mix(col, vec3(0.005, 0.010, 0.008), smoothstep(mound + 0.02, mound - 0.02, uv.y));
    col = mix(col, vec3(0.004, 0.008, 0.006), smoothstep(0.06, 0.0, uv.y));

    float vig = smoothstep(1.35, 0.45, length(uv - vec2(0.5, 0.5)));
    col *= mix(0.8, 1.0, vig);

    col = max(col + uwDither(), vec3(0.0196));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function HeroUwKelp({
  className,
  palette,
}: {
  className?: string;
  palette?: ShaderHeroPalette | null;
}) {
  // forward the animal palette — dropping it here silently reverts the
  // whole scene to the neutral greens (first harness run caught exactly
  // that: three animals, three near-identical ray regions)
  return <UnderwaterShader frag={FRAG} className={className} palette={palette} />;
}
