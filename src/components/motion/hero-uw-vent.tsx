/**
 * HeroUwVent — «Hydrothermal vent»: a black-smoker field at hadal
 * depth — basalt chimney silhouettes on the seabed, columns of shimmering
 * mineral smoke rising and shearing in the current, a dim ember glow at the
 * vent mouths (the only warm note in the whole UW set). Charcoal-blue water,
 * warm accent kept tiny so it reads geology, not lava.
 */
import { UnderwaterShader, UW_GLSL_LIB } from './hero-uw-shader';

const FRAG = /* glsl */ `
${UW_GLSL_LIB}

  // Rising smoke plume from mouth at (vx, vy): widens and thins with height.
  float plume(vec2 p, float vx, float vy, float t, float seed) {
    float h = p.y - vy;
    if (h < 0.0) return 0.0;
    // the current shears the column sideways as it climbs
    float shear = h * h * 0.55 * sin(t * 0.11 + seed);
    float w = 0.035 + h * 0.30;
    float core = exp(-pow((p.x - vx - shear) / w, 2.0));
    // advected turbulence inside the column
    float tex = fbm(vec2((p.x - shear) * 4.0 + seed * 9.0, p.y * 3.0 - t * 0.16));
    float fade = exp(-h * 2.1);
    return core * smoothstep(0.25, 0.75, tex) * fade;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    float aspect = uRes.x / uRes.y;
    vec2 p = vec2(uv.x * aspect, uv.y);
    float mx = uMouse.x - 0.5;

    // Charcoal-blue deep water with a faint cold downlight so the plumes
    // have something to read against.
    vec3 col = mix(vec3(0.009, 0.012, 0.018), vec3(0.026, 0.038, 0.055), pow(uv.y, 1.6));
    col += vec3(0.010, 0.016, 0.024) * fbm3(p * 1.5 + vec2(uTime * 0.012, 0.0));

    vec2 vent1 = vec2(aspect * 0.36 + mx * 0.06, 0.16);
    vec2 vent2 = vec2(aspect * 0.68 + mx * 0.10, 0.10);

    // Smoke columns (grey-blue mineral clouds).
    float s1 = plume(p, vent1.x, vent1.y, uTime, 1.7);
    float s2 = plume(p, vent2.x, vent2.y, uTime * 1.13, 4.2);
    col += vec3(0.065, 0.085, 0.105) * s1 * 1.5;
    col += vec3(0.055, 0.072, 0.092) * s2 * 1.4;
    // shimmering heat-water interface right above the mouths
    float shimmer1 = exp(-length((p - vent1) * vec2(6.0, 9.0)));
    float shimmer2 = exp(-length((p - vent2) * vec2(6.0, 9.0)));
    col += vec3(0.08, 0.095, 0.11) * (shimmer1 + shimmer2) *
           (0.6 + 0.4 * sin(uTime * 2.1 + p.y * 30.0));

    // Basalt chimneys + seabed: ridged silhouette, black on black.
    float ridge = 1.0 - abs(2.0 * vnoise(vec2((p.x + mx * 0.12) * 2.6, 7.7)) - 1.0);
    float ground = 0.05 + pow(ridge, 3.0) * 0.22 + fbm3(vec2(p.x * 1.3, 3.3)) * 0.06;
    float rock = smoothstep(ground + 0.005, ground - 0.005, uv.y);
    col = mix(col, vec3(0.005, 0.006, 0.008), rock);

    // Ember glow at the mouths — small, dim, warm; bleeds onto nearby rock.
    float ember1 = exp(-length((p - vent1) * vec2(10.0, 16.0)));
    float ember2 = exp(-length((p - vent2) * vec2(10.0, 16.0)));
    float flicker = 0.75 + 0.25 * sin(uTime * 1.7) * sin(uTime * 0.63 + 1.0);
    col += vec3(0.22, 0.075, 0.016) * (ember1 + ember2) * flicker;

    float vig = smoothstep(1.25, 0.4, length(uv - vec2(0.5, 0.42)));
    col *= mix(0.6, 1.0, vig);

    col = max(col + uwDither(), vec3(0.0196));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function HeroUwVent({ className }: { className?: string }) {
  return <UnderwaterShader frag={FRAG} className={className} />;
}
