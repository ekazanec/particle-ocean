/**
 * HeroUwCanyon — «Rock canyon»: dark rock walls closing in from both
 * sides in two parallax depths, a single volumetric light shaft falling
 * through the gap between them. Moonlit blue-grey palette — cold, quiet,
 * monumental. Pointer shifts the walls at different rates (near > far).
 */
import { UnderwaterShader, UW_GLSL_LIB } from './hero-uw-shader';

const FRAG = /* glsl */ `
${UW_GLSL_LIB}

  // Wall edge x-position as a function of height. side=-1 left, +1 right.
  float wallEdge(float y, float side, float seed, float reach) {
    // fbm3 is enough for a rock profile; called 4x/pixel so octaves matter.
    float e = reach + fbm3(vec2(y * 2.2 + seed, seed * 1.7)) * 0.30;
    // walls lean inward higher up — canyon narrows toward the light
    e += (1.0 - y) * -0.10;
    return e;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    float aspect = uRes.x / uRes.y;
    float halfW = aspect * 0.5;
    // x measured from canyon center
    float mx = (uMouse.x - 0.5);
    float x = (uv.x - 0.5) * aspect;

    // Cold water backdrop, clearly brighter high up where the shaft enters —
    // the gap must read against the walls.
    vec3 col = mix(vec3(0.014, 0.022, 0.036), vec3(0.055, 0.085, 0.125), pow(uv.y, 1.3));

    // Light shaft through the gap: swings very slowly, flickers with haze.
    float shaftX = 0.06 * sin(uTime * 0.10) + mx * 0.05;
    float shaft = exp(-pow((x - shaftX) * 3.0, 2.0));
    float haze = mix(0.6, 1.1, fbm3(vec2(x * 1.5, uv.y * 2.0 - uTime * 0.05)));
    col += vec3(0.14, 0.21, 0.30) * shaft * haze * pow(uv.y, 0.8) * 1.1;
    // dust motes caught in the shaft
    float motes = pow(vnoise(vec2(x * 9.0, uv.y * 7.0 - uTime * 0.12)), 6.0);
    col += vec3(0.22, 0.30, 0.40) * motes * shaft * 0.7;

    // FAR walls — pale blue-grey against the lit gap, weak parallax.
    float fl = wallEdge(uv.y, -1.0, 3.1, 0.34) - mx * 0.03;
    float fr = wallEdge(uv.y, 1.0, 8.7, 0.36) + mx * 0.03;
    float farMask = smoothstep(fl, fl + 0.012, -x) + smoothstep(fr, fr + 0.012, x);
    farMask = clamp(farMask, 0.0, 1.0);
    vec3 farRock = vec3(0.016, 0.024, 0.038) * (0.7 + 0.6 * vnoise(vec2(x * 3.0, uv.y * 3.0)));
    col = mix(col, farRock, farMask * 0.9);

    // NEAR walls — near-black, strong parallax, carve deeper into frame.
    float nl = wallEdge(uv.y, -1.0, 21.3, 0.52) - mx * 0.10;
    float nr = wallEdge(uv.y, 1.0, 33.9, 0.55) + mx * 0.10;
    float nearMask = smoothstep(nl, nl + 0.008, -x) + smoothstep(nr, nr + 0.008, x);
    nearMask = clamp(nearMask, 0.0, 1.0);
    vec3 nearRock = vec3(0.005, 0.007, 0.011) * (0.6 + 0.7 * vnoise(vec2(x * 5.0, uv.y * 5.0 + 40.0)));
    col = mix(col, nearRock, nearMask);
    // rim light where near rock meets the shaft glow
    float rim = nearMask * (1.0 - farMask) * shaft;
    col += vec3(0.07, 0.11, 0.16) * rim;

    float vig = smoothstep(1.4, 0.5, length(uv - vec2(0.5, 0.55)));
    col *= mix(0.8, 1.0, vig);

    col = max(col + uwDither(), vec3(0.0196));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function HeroUwCanyon({ className }: { className?: string }) {
  return <UnderwaterShader frag={FRAG} className={className} />;
}
