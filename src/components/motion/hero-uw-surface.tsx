/*!
 * particle-ocean · https://github.com/ekazanec/particle-ocean
 * Copyright (c) 2026 Andrey Gurov · https://agurov.com
 * MIT licensed. If you ship something built on this, a link back is appreciated.
 */
/**
 * HeroUwSurface — «Surface view»: looking straight up from depth — a
 * shimmering surface membrane rolls overhead, rays diverge downward through
 * the Snell window, and every ~20 s a slow wave passes and lenses the light.
 * The brightest thing in the UW set, still capped well below white so glowing
 * creatures own the frame. Pointer slides the Snell window.
 */
import { UnderwaterShader, UW_GLSL_LIB } from './hero-uw-shader';

const FRAG = /* glsl */ `
${UW_GLSL_LIB}

  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    float aspect = uRes.x / uRes.y;
    vec2 p = vec2(uv.x * aspect, uv.y);
    vec2 look = vec2(aspect * (0.5 + (uMouse.x - 0.5) * 0.22), 1.06);

    // Long swell passing overhead (~20 s) lenses everything below it.
    float swell = sin(uTime * 0.31 - p.x * 1.6);
    float lens = 1.0 + 0.18 * swell;

    // Surface membrane: two scales of moving ripple noise, alive but slow.
    vec2 rip = p * vec2(2.6, 7.0) + vec2(uTime * 0.10, -uTime * 0.16);
    float memb = fbm(rip) * 0.65 + fbm(rip * 2.3 + 17.0) * 0.35;
    float membBand = smoothstep(0.78, 1.0, uv.y); // membrane occupies the top
    float shimmer = pow(memb, 2.0) * membBand * lens;

    // Snell window: bright disc around the vertical, fading with angle.
    float ang = length(p - look);
    float snell = exp(-ang * ang * 1.7) * lens;

    // Rays diverging downward from the window.
    float theta = atan(p.x - look.x, look.y - p.y);
    float rays = pow(vnoise(vec2(theta * 11.0 + sin(uTime * 0.15) * 0.8,
                                 ang * 0.7 - uTime * 0.05)), 2.5);
    float rayFade = exp(-max(0.9 - uv.y, 0.0) * 2.4);

    // Water body: rich blue near surface → near-black depth.
    vec3 colDeep = vec3(0.006, 0.012, 0.024);
    vec3 colUp = vec3(0.030, 0.085, 0.140);
    vec3 col = mix(colDeep, colUp, pow(uv.y, 1.7));

    col += vec3(0.10, 0.22, 0.30) * snell * 0.9;
    col += vec3(0.30, 0.50, 0.60) * shimmer * 0.55;
    col += vec3(0.14, 0.28, 0.38) * rays * rayFade * snell * 1.1;
    // occasional glints where membrane crests align with the window
    col += vec3(0.35, 0.55, 0.62) * pow(memb, 5.0) * membBand * snell * 0.8;

    float vig = smoothstep(1.45, 0.5, length(uv - vec2(0.5, 0.65)));
    col *= mix(0.75, 1.0, vig);

    col = max(col + uwDither(), vec3(0.0196));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function HeroUwSurface({ className }: { className?: string }) {
  return <UnderwaterShader frag={FRAG} className={className} />;
}
