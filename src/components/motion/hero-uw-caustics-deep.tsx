/*!
 * particle-ocean · https://github.com/ekazanec/particle-ocean
 * Copyright (c) 2026 Andrey Gurov · https://agurov.com
 * MIT licensed. If you ship something built on this, a link back is appreciated.
 */
/**
 * HeroUwCausticsDeep — «Caustics · deep»: proper dim caustics playing on a
 * deep sea floor — NOT the acid-lime flood of hero-caustics. Two drifting
 * ridged-noise fields multiply into a connected filament web, compressed
 * toward the lower third (receding floor), lit in cold teal at low intensity;
 * above it only a faint suggestion of the light column that produces it.
 * Pointer drifts the pattern.
 *
 * NOTE: the borrowed hero-caustics formula was abandoned here on purpose —
 * its response saturates (~1.6) almost everywhere (that saturation IS the
 * yellow flood) and its dips are too sparse to read as a dim web. Ridged
 * value noise gives a guaranteed connected network at controllable density.
 */
import { UnderwaterShader, UW_GLSL_LIB } from './hero-uw-shader';

const FRAG = /* glsl */ `
${UW_GLSL_LIB}

  // Thin bright filament network: ridge of value noise, sharpened.
  float ridge(vec2 p) {
    return pow(1.0 - abs(2.0 * vnoise(p) - 1.0), 5.0);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    float aspect = uRes.x / uRes.y;
    vec2 nudge = (uMouse - 0.5) * 0.35;

    // Floor region under a soft horizon. The web is rendered flat with a
    // vertical squash (wide flat cells suggest the receding plane).
    float horizon = 0.46;
    float floorMask = smoothstep(horizon, horizon - 0.30, uv.y);
    vec2 fp = vec2(uv.x * aspect * 2.6 + nudge.x, uv.y * 7.5);

    // Two ridged fields drifting against each other read as refracted light
    // that keeps folding — their product keeps the web connected but alive.
    vec2 flow1 = vec2(uTime * 0.030, uTime * 0.016);
    vec2 flow2 = vec2(-uTime * 0.022, uTime * 0.026);
    float r1 = ridge(fp + flow1);
    float r2 = ridge(fp * 1.9 + 13.7 + flow2);
    float web = r1 * (0.35 + 1.1 * r2) + r2 * 0.22;

    // Fog eats the far edge of the pattern.
    float distFade = mix(1.0, 0.22, smoothstep(0.10, 0.42, uv.y));
    float f = web * floorMask * distFade;

    // Faint secondary shimmer higher in the water (light on suspended silt).
    float f2 = ridge(vec2(uv.x * aspect, uv.y) * 3.2 + nudge * 0.4 + flow1 * 1.4) *
               smoothstep(0.35, 0.9, uv.y) * 0.30;

    // Deep base: near-black with a cold green-blue breath.
    vec3 col = mix(vec3(0.006, 0.012, 0.014), vec3(0.012, 0.030, 0.034), pow(uv.y, 1.6));

    // Dim teal caustics — restrained vs the lime flood, but clearly present.
    vec3 caust = vec3(0.12, 0.36, 0.36);
    col += caust * smoothstep(0.03, 0.55, f) * 0.6;
    col += caust * smoothstep(0.55, 1.1, f) * 0.55; // hot cores of the filaments
    col += vec3(0.08, 0.22, 0.24) * f2;

    // The dying light column feeding the pattern from above.
    float beam = exp(-pow((uv.x - 0.5 - nudge.x * 0.15) * 2.2, 2.0)) * pow(uv.y, 2.0);
    col += vec3(0.015, 0.045, 0.055) * beam;

    float vig = smoothstep(1.35, 0.42, length(uv - vec2(0.5, 0.42)));
    col *= mix(0.75, 1.0, vig);

    col = max(col + uwDither(), vec3(0.0196));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function HeroUwCausticsDeep({ className }: { className?: string }) {
  return <UnderwaterShader frag={FRAG} className={className} />;
}
