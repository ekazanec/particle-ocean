/**
 * HeroUwBiolumGarden — «Glowing garden»: 2D backdrop of the bioluminescent
 * deep-garden biome (in-scene half: ocean/biomes/biolum.ts). The DARKEST
 * scene of the five:
 *
 * - near-black abyss gradient, barely bluer toward the top;
 * - sparse marine snow sinking slowly;
 * - RARE glow motes: a few drifting points that softly flare and die on
 *   long individual periods — the only light events of the backdrop;
 * - pitch-black floor mounds against the marginally lighter water.
 *
 * The in-scene sea pens carry their own traveling bioluminescent pulses;
 * the backdrop deliberately stays almost empty so those pulses read. No
 * pointer term anywhere — uMouse is not referenced in this scene by design.
 */
import { UnderwaterShader, UW_GLSL_LIB } from './hero-uw-shader';
import type { ShaderHeroPalette } from './shader-hero';

const FRAG = /* glsl */ `
${UW_GLSL_LIB}

  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    float aspect = uRes.x / uRes.y;
    vec2 p = vec2(uv.x * aspect, uv.y);

    // Abyss: near-black, the faintest blue breath toward the surface far
    // above. Palette leaning kept subtle — this scene must stay the darkest.
    vec3 deep = mix(vec3(0.004, 0.005, 0.009), uC0 * 0.8, 0.4);
    vec3 upper = mix(vec3(0.010, 0.013, 0.024), uC0 * 1.6, 0.4);
    vec3 col = mix(deep, upper, pow(uv.y, 1.6));

    // Marine snow: tiny specks sinking slowly through the dark.
    vec2 sp = p * 30.0 + vec2(uTime * 0.012, uTime * 0.045);
    vec2 sid = floor(sp);
    vec2 sf = fract(sp) - 0.5;
    vec2 so = hash22(sid) - 0.5;
    float snow = smoothstep(0.045, 0.0, length(sf - so * 0.6));
    snow *= step(hash12(sid + 3.0), 0.14);
    col += vec3(0.020, 0.024, 0.030) * snow;

    // Rare glow motes: sparse drifting points flaring softly on long
    // individual periods (T ≈ 9–17 s each, mostly dark).
    vec2 gp = p * 6.0 + vec2(uTime * 0.020, uTime * 0.008);
    vec2 gid = floor(gp);
    vec2 gf = fract(gp) - 0.5;
    vec2 go = hash22(gid) - 0.5;
    float gh = hash12(gid + 11.0);
    float keep = step(gh, 0.08); // very few cells own a mote
    float T = 9.0 + 8.0 * fract(gh * 13.0);
    float flare = pow(max(sin(uTime * 6.2832 / T + gh * 40.0), 0.0), 8.0);
    float mote = exp(-length(gf - go * 0.7) * 9.0) * keep * flare;
    vec3 bio = mix(vec3(0.35, 0.75, 0.80), uAccent * 1.2, 0.45);
    col += bio * mote * 0.55;

    // Pitch-black floor mounds against the marginally lighter water.
    float ridge1 = 0.14 + 0.10 * fbm3(vec2(p.x * 1.6 + 5.0, 2.0));
    col = mix(col, vec3(0.002, 0.003, 0.005), smoothstep(ridge1 + 0.012, ridge1 - 0.012, uv.y) * 0.9);
    float ridge2 = 0.07 + 0.07 * fbm3(vec2(p.x * 2.6 + 27.0, 6.0));
    col = mix(col, vec3(0.001, 0.002, 0.003), smoothstep(ridge2 + 0.008, ridge2 - 0.008, uv.y));

    float vig = smoothstep(1.4, 0.35, length(uv - vec2(0.5, 0.5)));
    col *= mix(0.75, 1.0, vig);

    col = max(col + uwDither(), vec3(0.0157));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function HeroUwBiolumGarden({
  className,
  palette,
}: {
  className?: string;
  palette?: ShaderHeroPalette | null;
}) {
  return <UnderwaterShader frag={FRAG} className={className} palette={palette} />;
}
