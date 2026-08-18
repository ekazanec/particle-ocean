/*!
 * particle-ocean · https://github.com/ekazanec/particle-ocean
 * Copyright (c) 2026 Andrey Gurov · https://agurov.com
 * MIT licensed. If you ship something built on this, a link back is appreciated.
 */
/**
 * HeroUwAbyss — «Abyss»: the hadal look — an almost-black vertical gradient
 * with a crushing vignette, the last memory of light high above, and every
 * now and then a huge unhurried silhouette passing far away in the murk
 * (~70 s round trip, barely brighter than the void). Sparse dead-still motes.
 * The most minimal backdrop of the set.
 */
import { UnderwaterShader, UW_GLSL_LIB } from './hero-uw-shader';

const FRAG = /* glsl */ `
${UW_GLSL_LIB}

  // Soft elongated body + tail hint, returns silhouette mask.
  float silhouette(vec2 p, vec2 c, float len, float t, float phase) {
    vec2 d = p - c;
    // gentle body undulation
    d.y += sin(d.x / len * 3.0 + t * 0.7 + phase) * len * 0.10;
    float body = exp(-pow(d.x / len, 2.0) * 3.0 - pow(d.y / (len * 0.24), 2.0) * 3.0);
    // tail taper
    float tail = exp(-pow((d.x - len * 0.9) / (len * 0.5), 2.0) * 4.0 -
                     pow(d.y / (len * 0.10), 2.0) * 3.0);
    return clamp(body + tail * 0.6, 0.0, 1.0);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    float aspect = uRes.x / uRes.y;
    vec2 p = vec2(uv.x * aspect, uv.y);
    float mx = uMouse.x - 0.5;

    // Void gradient: the faintest blue memory of the surface at the top.
    vec3 col = mix(vec3(0.005, 0.007, 0.011), vec3(0.018, 0.030, 0.052), pow(uv.y, 2.0));
    // slow breath of the deep water itself
    col += vec3(0.004, 0.007, 0.012) * fbm3(p * 1.2 + vec2(uTime * 0.008, 0.0));

    // Distant giant #1: crosses left→right over ~70 s, high in the frame.
    float t1 = fract(uTime / 70.0);
    vec2 c1 = vec2(mix(-0.6, aspect + 0.6, t1) + mx * 0.02, 0.68 + 0.04 * sin(uTime * 0.05));
    float s1 = silhouette(p, c1, 0.34, uTime, 0.0);
    col += vec3(0.013, 0.022, 0.036) * s1;

    // Distant giant #2: opposite direction, deeper, even slower (~95 s).
    float t2 = fract(uTime / 95.0 + 0.45);
    vec2 c2 = vec2(mix(aspect + 0.7, -0.7, t2) + mx * 0.05, 0.30 + 0.05 * sin(uTime * 0.04 + 2.0));
    float s2 = silhouette(vec2(-p.x + aspect, p.y), vec2(-c2.x + aspect, c2.y), 0.5, uTime, 3.0);
    col += vec3(0.006, 0.010, 0.017) * s2;

    // Rare, nearly static motes — the only texture the abyss allows.
    vec2 q = p + vec2(uTime * 0.002, uTime * 0.004);
    vec2 id = floor(q * 10.0);
    vec2 rnd = hash22(id);
    if (rnd.x > 0.88) {
      vec2 c = 0.3 + 0.4 * hash22(id + 5.0);
      float d = length(fract(q * 10.0) - c);
      col += vec3(0.05, 0.08, 0.10) * exp(-d * d / 0.0008) *
             (0.4 + 0.6 * sin(uTime * (0.3 + rnd.y) + rnd.x * 6.283)) * 0.35;
    }

    // Pressure vignette — heavy, uneven, closing in.
    float vig = smoothstep(1.15, 0.35, length((uv - vec2(0.5, 0.52)) * vec2(1.1, 1.35)));
    col *= mix(0.45, 1.0, vig);

    col = max(col + uwDither(), vec3(0.0196));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function HeroUwAbyss({ className }: { className?: string }) {
  return <UnderwaterShader frag={FRAG} className={className} />;
}
