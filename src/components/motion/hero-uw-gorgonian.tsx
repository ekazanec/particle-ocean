/**
 * HeroUwGorgonian — «Gorgonian garden»: 2D backdrop of the sea-fan garden
 * biome (in-scene half: ocean/biomes/gorgonia.ts). Tropical night:
 *
 * - deep blue-violet water, darkest of the "lit" biomes;
 * - a WARM light patch wandering slowly high in the frame (moonlit lagoon
 *   glow) — the warm-against-dark accent of the scene;
 * - sparse motes drifting through the dark;
 * - far rock pinnacles and simplified sea-fan silhouettes on the floor.
 *
 * GORG_LIGHT_GLSL is the single source of that warm light field: the
 * in-scene fans sample the IDENTICAL function at each fragment's screen
 * position on the shared absolute page clock. No pointer term anywhere —
 * uMouse is not referenced in this scene by design.
 */
import { UnderwaterShader, UW_GLSL_LIB } from './hero-uw-shader';
import type { ShaderHeroPalette } from './shader-hero';

/**
 * Shared warm night-light field (needs UW_NOISE_GLSL in scope). `p` —
 * aspect-corrected screen uv, `t` — ABSOLUTE page seconds. Returns glow
 * intensity ≥ 0 (≤ ~1 near the patch center).
 */
export const GORG_LIGHT_GLSL = /* glsl */ `
  float gorgLight(vec2 p, float aspect, float t) {
    // a soft patch wandering slowly near the top of the frame (~2.5 min arc)
    vec2 lp = vec2(aspect * (0.5 + 0.20 * sin(t * 0.041)),
                   0.95 + 0.06 * sin(t * 0.057 + 1.0));
    float g = exp(-length(p - lp) * 1.5);
    g *= 0.75 + 0.25 * fbm3(p * 1.8 + vec2(t * 0.02, -t * 0.015));
    return g;
  }
`;

const FRAG = /* glsl */ `
${UW_GLSL_LIB}
${GORG_LIGHT_GLSL}

  // Simplified far sea fan: outline + radial spokes, one per grid column.
  float fanSil(vec2 p, float cells, float seed, float floorY) {
    float gx = p.x * cells + seed;
    float id = floor(gx);
    float fx = fract(gx) - 0.5;
    vec2 rnd = hash22(vec2(id, seed));
    if (rnd.x < 0.35) return 0.0; // sparse garden
    vec2 f = vec2(fx, p.y - floorY);
    float sz = 0.10 + 0.08 * rnd.y;
    // trunk
    float m = step(abs(f.x), 0.008) * step(0.0, f.y) * step(f.y, sz * 0.45);
    // fan disc with spokes
    vec2 d = vec2(f.x, f.y - sz * 0.4);
    float r = length(d);
    float th = atan(d.x, d.y);
    float R = sz * (0.85 + 0.3 * vnoise(vec2(th * 2.0 + id, seed)));
    float spokes = step(abs(sin(th * (9.0 + rnd.x * 4.0) + r * 6.0)), mix(0.6, 0.3, r / max(R, 1e-3)));
    m = max(m, step(r, R) * step(abs(th), 1.5) * spokes);
    return m;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    float aspect = uRes.x / uRes.y;
    vec2 p = vec2(uv.x * aspect, uv.y);

    // Tropical-night water: violet-blue depth.
    vec3 deep = mix(vec3(0.010, 0.008, 0.020), uC0 * 1.2, 0.5);
    vec3 upper = mix(vec3(0.028, 0.024, 0.055), uC1 * 1.3, 0.5);
    vec3 col = mix(deep, upper, pow(uv.y, 1.3));

    // The warm wandering glow — shared field.
    float glw = gorgLight(p, aspect, uTime);
    vec3 warm = mix(vec3(0.30, 0.16, 0.07), uAccent, 0.45);
    col += warm * glw * 0.75;

    // Sparse motes drifting through the dark (seeded grid, slow diagonal).
    vec2 mp = p * 14.0 + vec2(uTime * 0.10, uTime * 0.035);
    vec2 mid2 = floor(mp);
    vec2 mf = fract(mp) - 0.5;
    vec2 mo = hash22(mid2) - 0.5;
    float mote = smoothstep(0.06, 0.0, length(mf - mo * 0.6));
    mote *= step(hash12(mid2 + 7.0), 0.10); // keep ~10% of cells
    col += (warm * 0.5 + uC2 * 0.5) * mote * 0.35;

    // Far rock pinnacles (two layers) + fan silhouettes on the floor line.
    float ridge1 = 0.16 + 0.14 * fbm3(vec2(p.x * 1.4 + 9.0, 3.0));
    vec3 rock1 = mix(vec3(0.012, 0.010, 0.020), uC0, 0.4);
    col = mix(col, rock1, smoothstep(ridge1 + 0.015, ridge1 - 0.015, uv.y) * 0.85);
    float fans = fanSil(p, 6.0, 5.0, ridge1 * 0.75);
    col = mix(col, rock1 * 0.9, fans * 0.8);
    float ridge2 = 0.085 + 0.09 * fbm3(vec2(p.x * 2.3 + 31.0, 8.0));
    vec3 rock2 = mix(vec3(0.006, 0.005, 0.011), uC0 * 0.7, 0.4);
    col = mix(col, rock2, smoothstep(ridge2 + 0.01, ridge2 - 0.01, uv.y));

    // Floor shadow.
    col = mix(col, vec3(0.004, 0.004, 0.008), smoothstep(0.045, 0.0, uv.y));

    float vig = smoothstep(1.35, 0.4, length(uv - vec2(0.5, 0.5)));
    col *= mix(0.78, 1.0, vig);

    col = max(col + uwDither(), vec3(0.0196));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function HeroUwGorgonian({
  className,
  palette,
}: {
  className?: string;
  palette?: ShaderHeroPalette | null;
}) {
  return <UnderwaterShader frag={FRAG} className={className} palette={palette} />;
}
