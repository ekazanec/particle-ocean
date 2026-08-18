/*!
 * particle-ocean · https://github.com/ekazanec/particle-ocean
 * Copyright (c) 2026 Andrey Gurov · https://agurov.com
 * MIT licensed. If you ship something built on this, a link back is appreciated.
 */
/**
 * HeroUwWaterColumn — «Water column»: visible density of the water itself —
 * horizontal strata of suspended sediment drifting sideways at different
 * speeds, plus two parallax layers of marine snow (slowly falling motes with
 * a lateral sway). Blue-teal palette, very slow, reads as mass and pressure.
 */
import { UnderwaterShader, UW_GLSL_LIB } from './hero-uw-shader';

const FRAG = /* glsl */ `
${UW_GLSL_LIB}

  // One faint falling mote per (sparse) grid cell.
  float snowLayer(vec2 p, float cell, float fall, float sway, float t) {
    vec2 q = vec2(p.x + sin(t * 0.11 + p.y * 2.0) * sway, p.y + t * fall);
    vec2 id = floor(q * cell);
    vec2 f = fract(q * cell);
    vec2 rnd = hash22(id);
    if (rnd.x < 0.62) return 0.0; // most cells empty → sparse snow
    vec2 c = 0.25 + 0.5 * hash22(id + 7.31);
    float d = length(f - c);
    float r = 0.015 + rnd.y * 0.03;
    float tw = 0.75 + 0.25 * sin(t * (0.6 + rnd.y) + rnd.x * 6.283);
    return exp(-d * d / (r * r)) * tw;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    float aspect = uRes.x / uRes.y;
    vec2 p = vec2(uv.x * aspect, uv.y);
    vec2 par = (uMouse - 0.5) * 0.05;

    // Density strata: fbm squashed vertically, three drift speeds blended.
    float s1 = fbm(vec2(p.x * 0.7 - uTime * 0.014, p.y * 2.6) + par * 0.4);
    float s2 = fbm(vec2(p.x * 1.3 + uTime * 0.009 + 31.0, p.y * 4.2) + par * 0.9);
    float strata = s1 * 0.65 + s2 * 0.35;

    // Base: teal-blue, brighter toward an unseen surface.
    vec3 deep = vec3(0.006, 0.016, 0.022);
    vec3 mid = vec3(0.018, 0.052, 0.066);
    vec3 col = mix(deep, mid, pow(uv.y, 1.25));
    // Density reads as slightly lighter suspended matter.
    col += vec3(0.038, 0.092, 0.108) * smoothstep(0.42, 0.85, strata);
    // A broad, rayless glow from above — light lost in the murk.
    col += vec3(0.02, 0.05, 0.07) * exp(-(1.0 - uv.y) * 2.2) *
           (0.7 + 0.3 * sin(uTime * 0.10));

    // Marine snow: far layer (small, slow) + near layer (bigger, faster).
    float snow = 0.0;
    snow += snowLayer(p + par * 0.5, 9.0, 0.010, 0.006, uTime) * 0.35;
    snow += snowLayer(p + par * 1.4 + 3.7, 5.0, 0.022, 0.012, uTime) * 0.6;
    col += vec3(0.45, 0.62, 0.68) * snow * 0.22;

    float vig = smoothstep(1.30, 0.40, length(uv - vec2(0.5, 0.5)));
    col *= mix(0.78, 1.0, vig);

    col = max(col + uwDither(), vec3(0.0196));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function HeroUwWaterColumn({ className }: { className?: string }) {
  return <UnderwaterShader frag={FRAG} className={className} />;
}
