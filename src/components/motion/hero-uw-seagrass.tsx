/*!
 * particle-ocean · https://github.com/ekazanec/particle-ocean
 * Copyright (c) 2026 Andrey Gurov · https://agurov.com
 * MIT licensed. If you ship something built on this, a link back is appreciated.
 */
/**
 * HeroUwSeagrass — «Eelgrass meadow»: 2D backdrop of the seagrass-meadow biome
 * (in-scene half: ocean/biomes/seagrass.ts). Serene bright-ish shallows:
 *
 * - upper region — sunlit turquoise water with surface caustic glitter;
 * - middle — a FAR meadow band: dozens of tiny grass blades bending under
 *   the same wind-like wave that travels across the in-scene meadow
 *   (same temporal frequencies, crests running left→right);
 * - bottom — sandy floor with drifting caustic dapples and ripple marks.
 *
 * GRASS_CAUSTIC_GLSL is the single source of the caustic-dapple field: the
 * in-scene grass samples the IDENTICAL function at each fragment's screen
 * position on the shared absolute page clock, so light plays over the real
 * blades in sync with the sand behind them. No pointer term anywhere —
 * uMouse is not referenced in this scene by design.
 */
import { UnderwaterShader, UW_GLSL_LIB } from './hero-uw-shader';
import type { ShaderHeroPalette } from './shader-hero';

/**
 * Shared caustic-dapple field (needs UW_NOISE_GLSL in scope). `p` —
 * aspect-corrected screen uv, `t` — ABSOLUTE page seconds. Returns dapple
 * light ≥ 0 (typically ≤ 1): two ridged noise sheets sliding against each
 * other — the classic shallow-water web.
 */
export const GRASS_CAUSTIC_GLSL = /* glsl */ `
  float grassCaustic(vec2 p, float aspect, float t) {
    vec2 w1 = p * 2.6 + vec2(t * 0.050, t * 0.023);
    vec2 w2 = p * 3.9 - vec2(t * 0.041, t * 0.017);
    float c1 = 1.0 - abs(2.0 * vnoise(w1) - 1.0);
    float c2 = 1.0 - abs(2.0 * vnoise(w2) - 1.0);
    return pow(clamp(c1 * 0.62 + c2 * 0.52, 0.0, 1.0), 3.0);
  }
`;

const FRAG = /* glsl */ `
${UW_GLSL_LIB}
${GRASS_CAUSTIC_GLSL}

  // Far meadow: one short blade per grid column, bending under the SAME
  // traveling wave family as the in-scene grass (crests run +x). No pointer
  // input anywhere in this scene.
  float grassLayer(vec2 p, float cells, float seed, float t, float amp, float floorY) {
    float gx = p.x * cells + seed;
    float id = floor(gx);
    float fx = fract(gx) - 0.5;
    vec2 rnd = hash22(vec2(id, seed));
    if (rnd.x < 0.18) return 0.0;
    float hgt = 0.07 + rnd.y * 0.08;
    float y = p.y - floorY;
    if (y < 0.0 || y > hgt) return 0.0;
    float yn = y / hgt;
    // meadow wave: same temporal frequencies as the biome bend, spatial
    // phase from the column id — crests sweep the whole band
    float tr = t - 0.35 * yn;
    float w1 = sin(0.55 * tr - 0.85 * id);
    float w2 = 0.45 * sin(0.90 * tr - 1.35 * id + 1.3);
    float g = 0.5 + 0.5 * (w1 + w2) / 1.45;
    float bend = (0.28 + 0.82 * g) * amp * yn * yn;
    float cx = bend + (rnd.x - 0.5) * 0.24 * yn; // seeded static lean
    float wdt = mix(0.060, 0.015, yn);
    float blade = smoothstep(wdt, wdt * 0.4, abs(fx - cx));
    return blade * smoothstep(1.0, 0.75, yn);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    float aspect = uRes.x / uRes.y;
    vec2 p = vec2(uv.x * aspect, uv.y);

    // Sunlit shallows: brightest of the five biomes — but still deep water.
    // Palette leaning kept light (0.35) so the serene turquoise mood
    // survives dark animal palettes.
    vec3 deep = mix(vec3(0.020, 0.056, 0.058), uC0 * 1.3, 0.35);
    vec3 lightWater = mix(vec3(0.080, 0.180, 0.185), uC2 * 1.5, 0.35);
    vec3 col = mix(deep, lightWater, pow(uv.y, 1.15));

    // Surface glitter: the shared caustic web, strongest near the top.
    float caU = grassCaustic(p * 0.9, aspect, uTime);
    col += (uC2 * 0.8 + uAccent * 0.25) * caU * smoothstep(0.35, 1.0, uv.y) * 0.65;

    // Sandy floor with ripple marks and drifting caustic dapples.
    float sandLine = 0.215 + 0.030 * sin(p.x * 3.1 + 1.7) + 0.025 * fbm3(vec2(p.x * 2.2, 4.0));
    float sand = smoothstep(sandLine + 0.012, sandLine - 0.012, uv.y);
    float caS = grassCaustic(vec2(p.x * 1.35, p.y * 2.6), aspect, uTime);
    vec3 sandCol = mix(vec3(0.078, 0.082, 0.062), uC2 * 0.55 + uC1 * 0.5, 0.3);
    sandCol *= 0.55 + 1.10 * caS;                          // dapples on sand
    sandCol *= 0.92 + 0.08 * sin(p.x * 46.0 + fbm3(p * 3.0) * 7.0); // ripples
    sandCol *= mix(0.55, 1.0, uv.y / max(sandLine, 1e-3)); // darker down
    col = mix(col, sandCol, sand);

    // Far meadow band: two layers of tiny blades on the sand horizon.
    vec3 grassFar = mix(vec3(0.014, 0.040, 0.028), uC1, 0.35);
    vec3 grassMid = mix(vec3(0.010, 0.028, 0.020), uC1 * 0.7, 0.35);
    float gl1 = grassLayer(p, 26.0, 7.0, uTime, 0.35, sandLine - 0.012);
    col = mix(col, grassFar, gl1 * 0.7);
    float gl2 = grassLayer(vec2(p.x, p.y), 40.0, 31.0, uTime * 1.04, 0.42, sandLine - 0.035);
    col = mix(col, grassMid, gl2 * 0.85);

    // Bottom shadow roots the frame.
    col = mix(col, vec3(0.010, 0.014, 0.010), smoothstep(0.05, 0.0, uv.y));

    float vig = smoothstep(1.4, 0.5, length(uv - vec2(0.5, 0.55)));
    col *= mix(0.82, 1.0, vig);

    col = max(col + uwDither(), vec3(0.0196));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function HeroUwSeagrass({
  className,
  palette,
}: {
  className?: string;
  palette?: ShaderHeroPalette | null;
}) {
  return <UnderwaterShader frag={FRAG} className={className} palette={palette} />;
}
