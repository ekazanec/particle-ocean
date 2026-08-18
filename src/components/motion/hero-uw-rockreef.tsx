/*!
 * particle-ocean · https://github.com/ekazanec/particle-ocean
 * Copyright (c) 2026 Andrey Gurov · https://agurov.com
 * MIT licensed. If you ship something built on this, a link back is appreciated.
 */
/**
 * HeroUwRockreef — «Rocky reef»: 2D backdrop of the rocky-reef-in-surge
 * biome (in-scene half: ocean/biomes/rocky-reef.ts). Moonlit cold night:
 *
 * - steel-blue water, broad moon shafts falling from the upper right and
 *   dissolving downward (REEF_MOON_GLSL — shared with the in-scene rocks);
 * - suspended particulate DRIVEN BY THE SURGE: the mote field advects back
 *   and forth on the same ~10 s swell period that rocks the in-scene algae
 *   tufts — the water itself visibly breathes;
 * - boulder skylines on two depth layers + floor shadow.
 *
 * No pointer term anywhere — uMouse is not referenced in this scene by
 * design.
 */
import { UnderwaterShader, UW_GLSL_LIB } from './hero-uw-shader';
import type { ShaderHeroPalette } from './shader-hero';

/**
 * Shared moonlight field (needs UW_NOISE_GLSL in scope). `p` —
 * aspect-corrected screen uv, `t` — ABSOLUTE page seconds. Broad cold
 * shafts from the upper right, swinging very slowly.
 */
export const REEF_MOON_GLSL = /* glsl */ `
  float reefMoon(vec2 p, float aspect, float t) {
    vec2 moon = vec2(aspect * 0.74, 1.5);
    vec2 tm = moon - p;
    float d = length(tm);
    float theta = atan(tm.x, tm.y);
    float swing = 0.10 * sin(t * 0.13) + 0.05 * sin(t * 0.052 + 1.2);
    float rays = vnoise(vec2((theta + swing) * 5.0, d * 0.5 - t * 0.03));
    float shafts = pow(rays, 3.0);
    float depthFade = exp(-max(1.0 - p.y, 0.0) * 2.2);
    return shafts * depthFade * (0.6 + 0.5 * fbm3(p * 1.2 + vec2(t * 0.02, 0.0)));
  }
`;

const FRAG = /* glsl */ `
${UW_GLSL_LIB}
${REEF_MOON_GLSL}

  // Boulder skyline: rounded seeded domes per grid column on a floor line.
  float boulderLine(vec2 p, float cells, float seed, float floorY) {
    float gx = p.x * cells + seed;
    float id = floor(gx);
    float fx = fract(gx) - 0.5;
    vec2 rnd = hash22(vec2(id, seed));
    if (rnd.x < 0.2) return 0.0;
    float R = 0.10 + 0.14 * rnd.y;
    float hgt = R * (0.8 + 0.5 * rnd.x);
    vec2 d = vec2(fx * (0.8 + 0.5 * rnd.x), p.y - floorY);
    float r = length(d);
    float edge = R * (0.80 + 0.25 * vnoise(vec2(atan(d.x, d.y) * 1.8 + id, seed)));
    return smoothstep(edge + 0.01, edge - 0.01, r) * step(p.y - floorY, hgt);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    float aspect = uRes.x / uRes.y;
    vec2 p = vec2(uv.x * aspect, uv.y);

    // Cold steel-blue night water.
    vec3 deep = mix(vec3(0.008, 0.011, 0.018), uC0 * 1.2, 0.5);
    vec3 upper = mix(vec3(0.022, 0.034, 0.055), uC1 * 1.3, 0.5);
    vec3 col = mix(deep, upper, pow(uv.y, 1.35));

    // Moon shafts — the shared field + a soft glow toward the moon.
    float ml = reefMoon(p, aspect, uTime);
    vec3 moonCol = mix(vec3(0.30, 0.40, 0.52), uC2 * 1.2 + uAccent * 0.3, 0.45);
    col += moonCol * ml * 0.75;
    col += moonCol * 0.5 * exp(-length(vec2(aspect * 0.74, 1.5) - p) * 1.2);

    // Suspended particulate driven by the surge: the whole mote field
    // advects back and forth on the surge period (~10 s), plus a slow drift.
    float surge = 0.22 * sin(0.62 * uTime) + 0.06 * sin(1.24 * uTime + 0.9);
    vec2 mp = p * 18.0 + vec2(surge * 2.2 + uTime * 0.015, uTime * 0.02);
    vec2 mid2 = floor(mp);
    vec2 mf = fract(mp) - 0.5;
    vec2 mo = hash22(mid2) - 0.5;
    float mote = smoothstep(0.05, 0.0, length(mf - mo * 0.6));
    mote *= step(hash12(mid2 + 5.0), 0.16);
    col += moonCol * mote * 0.30;

    // Boulder skylines: far ledge line + a bolder near line.
    float ridge1 = 0.20 + 0.13 * fbm3(vec2(p.x * 1.2 + 17.0, 3.0));
    vec3 rockFar = mix(vec3(0.010, 0.014, 0.022), uC0, 0.4);
    col = mix(col, rockFar, smoothstep(ridge1 + 0.015, ridge1 - 0.015, uv.y) * 0.85);
    float b1 = boulderLine(p, 3.2, 13.0, ridge1 * 0.7);
    col = mix(col, rockFar * 0.85, b1 * 0.9);
    float ridge2 = 0.09 + 0.08 * fbm3(vec2(p.x * 2.0 + 41.0, 7.0));
    vec3 rockNear = mix(vec3(0.005, 0.007, 0.011), uC0 * 0.7, 0.4);
    col = mix(col, rockNear, smoothstep(ridge2 + 0.012, ridge2 - 0.012, uv.y));
    float b2 = boulderLine(p, 2.1, 37.0, ridge2 * 0.6);
    col = mix(col, rockNear * 0.9, b2);

    // Floor shadow.
    col = mix(col, vec3(0.003, 0.005, 0.008), smoothstep(0.05, 0.0, uv.y));

    float vig = smoothstep(1.35, 0.42, length(uv - vec2(0.5, 0.5)));
    col *= mix(0.78, 1.0, vig);

    col = max(col + uwDither(), vec3(0.0196));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function HeroUwRockreef({
  className,
  palette,
}: {
  className?: string;
  palette?: ShaderHeroPalette | null;
}) {
  return <UnderwaterShader frag={FRAG} className={className} palette={palette} />;
}
