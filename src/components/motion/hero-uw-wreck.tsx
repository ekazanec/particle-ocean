/*!
 * particle-ocean · https://github.com/ekazanec/particle-ocean
 * Copyright (c) 2026 Andrey Gurov · https://agurov.com
 * MIT licensed. If you ship something built on this, a link back is appreciated.
 */
/**
 * HeroUwWreck — «Shipwreck»: a hull silhouette resting on the bottom
 * far away in the blue fog — rounded keel, tilted deck line, one standing and
 * one broken mast — back-lit by dim god rays, marine snow sinking through the
 * scene. Distance fog keeps the wreck a rumor rather than a poster. Pointer
 * pans the wreck against the light for a light parallax.
 */
import { UnderwaterShader, UW_GLSL_LIB } from './hero-uw-shader';

const FRAG = /* glsl */ `
${UW_GLSL_LIB}

  float snow(vec2 p, float cell, float fall, float t) {
    vec2 q = vec2(p.x + sin(t * 0.1 + p.y * 2.5) * 0.008, p.y + t * fall);
    vec2 id = floor(q * cell);
    vec2 f = fract(q * cell);
    vec2 rnd = hash22(id);
    if (rnd.x < 0.7) return 0.0;
    float d = length(f - (0.25 + 0.5 * hash22(id + 9.1)));
    return exp(-d * d / 0.0015) * (0.6 + 0.4 * rnd.y);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    float aspect = uRes.x / uRes.y;
    vec2 p = vec2(uv.x * aspect, uv.y);
    float mx = uMouse.x - 0.5;

    // Blue fog water column — bright enough for a silhouette to read on it.
    vec3 col = mix(vec3(0.012, 0.024, 0.042), vec3(0.030, 0.070, 0.115), pow(uv.y, 1.1));

    // Dim god rays behind the wreck (back-light).
    vec2 sun = vec2(aspect * 0.62, 1.5);
    vec2 toSun = sun - p;
    float theta = atan(toSun.x, toSun.y);
    float rays = pow(vnoise(vec2(theta * 10.0 + sin(uTime * 0.14) * 0.5,
                                 length(toSun) * 0.7 - uTime * 0.05)), 2.8);
    col += vec3(0.08, 0.16, 0.23) * rays * exp(-(1.0 - uv.y) * 1.8);
    // Haze pocket behind the hull — the back-light that silhouettes it.
    col += vec3(0.030, 0.062, 0.090) * exp(-length((p - vec2(aspect * 0.55, 0.42)) * vec2(1.6, 2.6)));

    // ---- Wreck silhouette (in fog) ----
    float cx = aspect * 0.52 + mx * 0.07;       // hull center
    float L = aspect * 0.30;                     // half length
    float s = (p.x - cx) / L;                    // -1..1 along the hull
    float hull = 0.0;
    if (abs(s) < 1.0) {
      float keel = 0.30 - 0.155 * sqrt(max(1.0 - s * s, 0.0)); // rounded bottom
      float deck = 0.335 + 0.045 * s;                          // listing deck
      hull = smoothstep(keel - 0.004, keel + 0.004, uv.y) *
             smoothstep(deck + 0.004, deck - 0.004, uv.y);
      // broken superstructure hump amidships
      float hump = smoothstep(0.05, 0.0, abs(s + 0.15) - 0.12) *
                   smoothstep(deck + 0.05, deck, uv.y) *
                   smoothstep(deck - 0.002, deck + 0.002, uv.y + 0.03);
      hull = max(hull, hump);
    }
    // standing mast (slightly tilted with the list)
    float mastX = cx - L * 0.28 + (uv.y - 0.33) * 0.06;
    float mast = smoothstep(0.006, 0.003, abs(p.x - mastX)) *
                 smoothstep(0.62, 0.60, uv.y) * step(0.30, uv.y);
    // broken mast stub leaning hard
    float stubX = cx + L * 0.38 + (uv.y - 0.34) * 0.30;
    float stub = smoothstep(0.006, 0.003, abs(p.x - stubX)) *
                 smoothstep(0.46, 0.44, uv.y) * step(0.31, uv.y);
    float wreck = clamp(hull + mast + stub, 0.0, 1.0);

    // Distance fog: the wreck is a dark tint, never a hard cutout — but it
    // must clearly read against the haze pocket behind it.
    float fog = 0.85 + 0.07 * sin(uTime * 0.07); // fog slowly breathes
    vec3 wreckCol = vec3(0.004, 0.008, 0.013);
    col = mix(col, wreckCol, wreck * fog);
    // faint rim where rays graze the deck line
    col += vec3(0.04, 0.09, 0.13) * wreck * rays * 0.5;

    // Seabed the hull rests on.
    float bed = 0.16 + fbm3(vec2(p.x * 1.6, 8.8)) * 0.05;
    col = mix(col, vec3(0.006, 0.011, 0.017), smoothstep(bed + 0.01, bed - 0.02, uv.y) * 0.85);

    // Marine snow, two depths.
    col += vec3(0.35, 0.50, 0.58) * snow(p, 8.0, 0.012, uTime) * 0.16;
    col += vec3(0.40, 0.55, 0.62) * snow(p + 4.2, 4.5, 0.026, uTime) * 0.20;

    float vig = smoothstep(1.35, 0.45, length(uv - vec2(0.5, 0.5)));
    col *= mix(0.75, 1.0, vig);

    col = max(col + uwDither(), vec3(0.0196));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function HeroUwWreck({ className }: { className?: string }) {
  return <UnderwaterShader frag={FRAG} className={className} />;
}
