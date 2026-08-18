/*!
 * particle-ocean · https://github.com/ekazanec/particle-ocean
 * Copyright (c) 2026 Andrey Gurov · https://agurov.com
 * MIT licensed. If you ship something built on this, a link back is appreciated.
 */
/**
 * HeroUwReef — «Coral reef»: reef silhouettes along the seabed in two
 * parallax layers — a rounded coral massif behind, spiky gorgonian fans in
 * front. The front edge "breathes" gently (polyp sway), sparse plankton motes
 * drift upward through a teal water column. Pointer pans the layers.
 */
import { UnderwaterShader, UW_GLSL_LIB } from './hero-uw-shader';

const FRAG = /* glsl */ `
${UW_GLSL_LIB}

  // Rounded reef heightfield.
  float reefBack(float x) {
    return 0.16 + fbm3(vec2(x * 1.4, 3.7)) * 0.22;
  }

  // Spiky gorgonian profile: ridged noise → branch-like spires.
  float reefFront(float x, float t) {
    float ridge = 1.0 - abs(2.0 * vnoise(vec2(x * 3.2, 9.1)) - 1.0);
    float spikes = pow(ridge, 2.2) * 0.30;
    float base = 0.06 + fbm3(vec2(x * 1.1, 17.3)) * 0.10;
    // polyp sway: tiny slow breathing of the outline
    float sway = 0.008 * sin(t * 0.5 + x * 14.0) + 0.005 * sin(t * 0.9 + x * 31.0);
    return base + spikes + sway;
  }

  float plankton(vec2 p, float cell, float rise, float t) {
    vec2 q = vec2(p.x + sin(t * 0.13 + p.y * 3.0) * 0.008, p.y - t * rise);
    vec2 id = floor(q * cell);
    vec2 f = fract(q * cell);
    vec2 rnd = hash22(id);
    if (rnd.x < 0.75) return 0.0;
    vec2 c = 0.2 + 0.6 * hash22(id + 3.1);
    float d = length(f - c);
    float tw = 0.6 + 0.4 * sin(t * (0.8 + rnd.y * 1.5) + rnd.x * 6.283);
    return exp(-d * d / 0.0012) * tw;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    float aspect = uRes.x / uRes.y;
    vec2 p = vec2(uv.x * aspect, uv.y);
    float mx = uMouse.x - 0.5;

    // Teal water with a soft slanted light from the upper right.
    vec3 col = mix(vec3(0.010, 0.030, 0.038), vec3(0.030, 0.095, 0.115), pow(uv.y, 1.2));
    float slant = pow(max(0.0, 1.0 - length(uv - vec2(0.78, 1.12))), 2.0);
    col += vec3(0.05, 0.13, 0.15) * slant * (0.8 + 0.2 * sin(uTime * 0.12));

    // Back reef massif — hazy blue-teal silhouette against the lit water.
    float hb = reefBack(p.x + mx * 0.05);
    float mb = smoothstep(hb + 0.006, hb - 0.006, uv.y);
    col = mix(col, vec3(0.008, 0.024, 0.030), mb * 0.9);

    // Front gorgonian layer — near-black spires, stronger parallax.
    float hf = reefFront(p.x + mx * 0.14, uTime);
    float mf = smoothstep(hf + 0.004, hf - 0.004, uv.y);
    col = mix(col, vec3(0.004, 0.009, 0.010), mf);
    // Bioluminescent rim on the front outline (polyps catching light).
    float rim = mf * (1.0 - smoothstep(hf - 0.02, hf - 0.05, uv.y));
    col += vec3(0.07, 0.20, 0.19) * rim * (0.6 + 0.4 * sin(uTime * 0.4 + p.x * 8.0));

    // Sparse plankton drifting up between the layers.
    float pk = plankton(p + vec2(mx * 0.08, 0.0), 7.0, 0.012, uTime);
    col += vec3(0.20, 0.45, 0.42) * pk * 0.30 * (1.0 - mf);

    float vig = smoothstep(1.35, 0.45, length(uv - vec2(0.5, 0.5)));
    col *= mix(0.78, 1.0, vig);

    col = max(col + uwDither(), vec3(0.0196));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function HeroUwReef({ className }: { className?: string }) {
  return <UnderwaterShader frag={FRAG} className={className} />;
}
