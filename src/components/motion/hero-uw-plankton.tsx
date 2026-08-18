/**
 * HeroUwPlankton — «Bioluminescent plankton»: near-black water seeded with
 * faint cyan-green glow points that drift on slow eddies and pulse softly;
 * ghostly wisps of colony glow (fbm fog) breathe underneath. The water lights
 * up subtly around the pointer — the classic bioluminescence-on-disturbance
 * response, kept restrained.
 */
import { UnderwaterShader, UW_GLSL_LIB } from './hero-uw-shader';

const FRAG = /* glsl */ `
${UW_GLSL_LIB}

  float motes(vec2 p, float cell, float t, float drift) {
    vec2 q = p + vec2(t * drift, sin(t * 0.07 + p.x) * 0.02);
    vec2 id = floor(q * cell);
    vec2 f = fract(q * cell);
    vec2 rnd = hash22(id);
    if (rnd.x < 0.55) return 0.0;
    // each mote wanders inside its cell on its own slow orbit
    vec2 c = 0.5 + 0.32 * vec2(sin(t * (0.10 + rnd.y * 0.15) + rnd.x * 6.283),
                               cos(t * (0.08 + rnd.x * 0.13) + rnd.y * 6.283));
    float d = length(f - c);
    float pulse = 0.45 + 0.55 * pow(0.5 + 0.5 * sin(t * (0.5 + rnd.y * 1.1) + rnd.x * 6.283), 2.0);
    return exp(-d * d / 0.003) * pulse;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    float aspect = uRes.x / uRes.y;
    vec2 p = vec2(uv.x * aspect, uv.y);
    vec2 m = vec2(uMouse.x * aspect, uMouse.y);

    // Deepest of the "open water" set: near-black with a whisper of blue.
    vec3 col = mix(vec3(0.005, 0.008, 0.014), vec3(0.010, 0.018, 0.028), pow(uv.y, 1.6));

    // Colony wisps: slow domain-warped fog that carries a dim green glow.
    vec2 warp = vec2(fbm3(p * 1.1 + uTime * 0.015), fbm3(p * 1.1 - uTime * 0.012 + 5.0));
    float wisp = fbm(p * 1.6 + warp * 0.8 + vec2(0.0, -uTime * 0.008));
    col += vec3(0.010, 0.045, 0.038) * smoothstep(0.55, 0.9, wisp) * 0.8;

    // Disturbance glow around the pointer (soft, wide, slow to matter).
    float stir = exp(-length(p - m) * 2.4);

    // Three drifting mote layers, brightened where the water is stirred.
    float g1 = motes(p, 6.0, uTime, 0.006);
    float g2 = motes(p + 13.7, 9.0, uTime * 1.2, -0.004);
    float g3 = motes(p + 31.2, 13.0, uTime * 0.8, 0.003);
    float glow = g1 * 0.55 + g2 * 0.35 + g3 * 0.25;
    glow *= 1.0 + 1.6 * stir;

    col += vec3(0.10, 0.55, 0.48) * glow * 0.30;
    col += vec3(0.05, 0.30, 0.28) * stir * wisp * 0.25; // stirred wisps answer too

    float vig = smoothstep(1.3, 0.4, length(uv - vec2(0.5, 0.5)));
    col *= mix(0.8, 1.0, vig);

    col = max(col + uwDither(), vec3(0.0196));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function HeroUwPlankton({ className }: { className?: string }) {
  return <UnderwaterShader frag={FRAG} className={className} />;
}
