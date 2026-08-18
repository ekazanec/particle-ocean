/*!
 * particle-ocean · https://github.com/ekazanec/particle-ocean
 * Copyright (c) 2026 Andrey Gurov · https://agurov.com
 * MIT licensed. If you ship something built on this, a link back is appreciated.
 */
/**
 * HeroUwCoralCanyonArt — «Coral canyon (art)»: a licensed flat-vector
 * reef-canyon illustration (warm corals framing left/right, blue water column,
 * sun disk + surface streaks up top, orange fish schools) brought to life.
 * The 2048×1024 plate (public/uw/coral-canyon-art.webp) is the base layer of
 * a single fullscreen quad; everything animated is procedural on top of it:
 *
 *  1. refraction  — sine+noise UV warp, ≤ ~2.5 px, periods 11.4/15 s,
 *                   depth-graded (full near the surface, zero on the corals);
 *  2. sun pulse   — soft radial glow breathing at T ≈ 14 s;
 *  3. streak shimmer — luminance-masked sparkle drifting laterally through
 *                   the top surface band (tuv.y > 0.72);
 *  4. god rays    — angular fbm beams from the sun, swing T ≈ 105 s,
 *                   masked to open water (blue-dominance mask);
 *  5. fish life   — two grid-hashed layers of flat orange dashes in loose
 *                   clusters drifting through the central column + one large
 *                   silhouette crossing far back every 48 s;
 *  6. motes       — sparse bright particles rising slowly;
 *  7. Ken-Burns   — whole-frame zoom 1.017→1.053 + tiny pan, 60 s cosine loop.
 *
 * DELIBERATELY NOT palette-adaptive (uC0…uAccent unused): this is an art
 * piece — it keeps its own colors regardless of the active animal.
 * No pointer influence anywhere (uMouse unused). Reduced motion → the host
 * renders one static frame of the plate. Cost: one texture fetch + cheap
 * procedural math per fragment.
 */
import { UnderwaterShader, UW_GLSL_LIB } from './hero-uw-shader';

const FRAG = /* glsl */ `
${UW_GLSL_LIB}

  uniform sampler2D uTex;
  uniform float uTexAspect; // plate w/h (2.0)
  uniform float uTexReady;  // 0 until the plate is decoded

  // Loose fish school: hashed anisotropic grid of horizontal dashes whose
  // presence is gated by a slow-drifting low-frequency cluster noise.
  // uv is plate-space; q is aspect-corrected so dashes keep their shape.
  float school(vec2 uv, float t, float cellN, vec2 vel, float seed) {
    vec2 q = vec2(uv.x * uTexAspect, uv.y);
    vec2 p = (q - vel * t) * cellN;
    vec2 cell = floor(p);
    vec2 f = fract(p) - 0.5;
    float rnd = hash12(cell + seed);
    float present = step(0.55, rnd);
    float cluster = smoothstep(0.54, 0.72, vnoise(cell * 0.33 + seed + vec2(t * 0.006, 0.0)));
    vec2 jit = (hash22(cell + seed * 1.31) - 0.5) * 0.55;
    vec2 d = f - jit;
    d.y += 0.05 * sin(t * 1.7 + rnd * 6.2831);
    d.x += 0.03 * sin(t * 0.9 + rnd * 12.0);
    vec2 e = d * vec2(6.0, 16.0);
    return exp(-dot(e, e)) * present * cluster;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    float t = uTime;

    if (uTexReady < 0.5) {
      // one-frame fallback while the plate decodes: plain water gradient
      vec3 base = mix(vec3(0.05, 0.12, 0.16), vec3(0.38, 0.62, 0.66), pow(uv.y, 1.4));
      gl_FragColor = vec4(base + uwDither(), 1.0);
      return;
    }

    // ---- 7. Ken-Burns cover mapping (60 s cosine loop, no layer separation)
    float sa = uRes.x / uRes.y;
    float kb = 6.2831853 * t / 60.0;
    float zoom = 1.035 + 0.018 * cos(kb);       // 1.017 … 1.053
    vec2 pan = vec2(0.0030 * sin(kb), 0.0018 * cos(kb * 2.0));
    vec2 st = uv - 0.5;
    if (sa > uTexAspect) st.y *= uTexAspect / sa;
    else st.x *= sa / uTexAspect;
    vec2 tuv = st / zoom + pan + 0.5;

    // ---- 1. Refraction warp — surface-weighted, corals stay solid
    float wAmp = 0.0026 * smoothstep(0.25, 0.9, tuv.y);
    vec2 warp = vec2(
      sin(tuv.y * 21.0 + t * 0.55) + 0.6 * sin(tuv.y * 9.0 - t * 0.42),
      0.5 * sin(tuv.x * 17.0 + t * 0.48)
    ) * wAmp * (0.6 + 0.4 * vnoise(tuv * 3.0 + t * 0.05));
    vec3 col = texture2D(uTex, clamp(tuv + warp, 0.002, 0.998)).rgb;

    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    // open-water mask: blue dominance — keeps rays/fish off corals and rock
    float wm = smoothstep(0.04, 0.18, col.b - col.r);

    // ---- 3. Surface streak shimmer (top band, luminance-masked, drifting)
    float band = smoothstep(0.72, 0.84, tuv.y);
    float shimmer = fbm3(vec2(tuv.x * 16.0 - t * 0.10, tuv.y * 40.0 + 0.35 * sin(t * 0.22))) - 0.5;
    col += col * shimmer * band * smoothstep(0.45, 0.75, lum) * 0.5;

    // ---- 2. Sun glow pulse (plate sun sits at ~(0.49, 0.96))
    vec2 sunP = vec2(0.4875, 0.96);
    vec2 sd = (tuv - sunP) * vec2(uTexAspect, 1.0);
    float sr = length(sd);
    float pulse = 0.5 + 0.5 * sin(t * 0.45);
    col += vec3(1.0, 0.95, 0.82) * exp(-sr * sr * 9.0) * (0.05 + 0.06 * pulse);

    // ---- 4. God rays — angular beams from the sun, slow swing, water-only
    float ang = atan(sd.x, -sd.y);
    float rayN = fbm3(vec2(ang * 6.0 + 0.8 * sin(t * 0.06), t * 0.015));
    float rays = pow(clamp(rayN * 1.6 - 0.55, 0.0, 1.0), 2.0);
    col += vec3(0.55, 0.75, 0.85) * rays * smoothstep(1.25, 0.2, sr) * (0.35 + 0.65 * wm) * 0.10;

    // ---- 5a. Fish schools in the central water column
    float fish = school(tuv, t, 30.0, vec2(0.010, 0.0016), 3.1)
               + school(tuv, t, 38.0, vec2(-0.008, 0.0012), 7.7);
    float colM = smoothstep(0.24, 0.34, tuv.x) * smoothstep(0.78, 0.66, tuv.x)
               * smoothstep(0.08, 0.20, tuv.y) * smoothstep(0.66, 0.50, tuv.y);
    col = mix(col, vec3(0.98, 0.62, 0.16), clamp(fish, 0.0, 1.0) * colM * (0.3 + 0.7 * wm) * 0.85);

    // ---- 5b. Rare large silhouette crossing far back (48 s cycle, 26 s pass)
    float cyc = 48.0;
    float ph = fract(t / cyc);
    float dir = mod(floor(t / cyc), 2.0) * 2.0 - 1.0; // alternate direction
    float travel = clamp(ph / 0.55, 0.0, 1.0);
    float bx = mix(-0.15, 1.15, travel);
    bx = mix(1.0 - bx, bx, step(0.0, dir));
    vec2 bd = (tuv - vec2(bx, 0.47 + 0.05 * sin(ph * 12.0))) * vec2(uTexAspect, 1.0);
    float body = exp(-pow(bd.x / 0.075, 2.0) * 2.2 - pow(bd.y / 0.017, 2.0) * 2.2);
    vec2 td = bd + vec2(dir * 0.07, 0.0);
    float tail = exp(-pow(td.x / 0.02, 2.0) * 2.0 - pow(td.y / (0.008 + abs(td.x) * 0.9), 2.0) * 1.4);
    float big = clamp(body + tail * 0.8, 0.0, 1.0) * (1.0 - step(0.55, ph));
    col = mix(col, vec3(0.05, 0.10, 0.14), big * 0.32 * wm);

    // ---- 6. Sparse bright motes rising through the frame (water-gated so
    // they don't snow over the dark coral frames)
    float m1 = pow(vnoise(vec2(tuv.x * uTexAspect * 42.0 + 0.4 * sin(t * 0.2 + tuv.y * 6.0), tuv.y * 42.0 - t * 0.55)), 13.0);
    float m2 = pow(vnoise(vec2(tuv.x * uTexAspect * 23.0 + 11.0, tuv.y * 23.0 - t * 0.32)), 13.0);
    col += vec3(0.85, 0.95, 1.0) * (m1 * 0.4 + m2 * 0.3) * (0.15 + 0.85 * wm);

    gl_FragColor = vec4(col + uwDither(), 1.0);
  }
`;

export function HeroUwCoralCanyonArt({ className }: { className?: string }) {
  return (
    <UnderwaterShader
      frag={FRAG}
      className={className}
      textureUrl="/uw/coral-canyon-art.webp"
    />
  );
}
