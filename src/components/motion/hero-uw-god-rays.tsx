/*!
 * particle-ocean · https://github.com/ekazanec/particle-ocean
 * Copyright (c) 2026 Andrey Gurov · https://agurov.com
 * MIT licensed. If you ship something built on this, a link back is appreciated.
 */
/**
 * HeroUwGodRays — «God rays»: volumetric sun shafts penetrating from
 * the top of the frame, slowly swinging as the surface above moves; depth fog
 * swallows them toward the bottom. Deep-blue palette over #050505, marine haze
 * via fbm. Pointer nudges the apparent sun position. Single-pass quad shader.
 */
import { UnderwaterShader, UW_GLSL_LIB } from './hero-uw-shader';

const FRAG = /* glsl */ `
${UW_GLSL_LIB}

  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    float aspect = uRes.x / uRes.y;
    vec2 p = vec2(uv.x * aspect, uv.y);

    // Sun sits above the frame; pointer drags it a little sideways.
    vec2 sun = vec2(aspect * (0.5 + (uMouse.x - 0.5) * 0.18), 1.55);
    vec2 toSun = sun - p;
    float d = length(toSun);
    float theta = atan(toSun.x, toSun.y); // angle from vertical

    // Whole fan swings slowly (~35 s period) like the surface rolling above.
    float swing = 0.16 * sin(uTime * 0.18) + 0.06 * sin(uTime * 0.071 + 2.0);

    // Two interleaved streak fields → rays of different width and phase.
    float rays1 = vnoise(vec2((theta + swing) * 9.0, d * 0.6 - uTime * 0.045));
    float rays2 = vnoise(vec2((theta - swing * 0.6) * 17.0 + 40.0, d * 0.9 - uTime * 0.07));
    float shafts = pow(rays1, 2.6) * 0.85 + pow(rays2, 3.2) * 0.55;

    // Rays live near the top and dissolve into the water column.
    float depthFade = exp(-max(1.55 - uv.y - 0.55, 0.0) * 2.6);
    // Volumetric haze drifting through the beams.
    float haze = mix(0.55, 1.1, fbm(p * 1.4 + vec2(uTime * 0.03, -uTime * 0.02)));
    float light = shafts * depthFade * haze;

    // Depth-fog background: dim blue up top, near-black at the seabed.
    vec3 top = vec3(0.016, 0.055, 0.105);
    vec3 bottom = vec3(0.008, 0.014, 0.026);
    vec3 col = mix(bottom, top, pow(uv.y, 1.4));

    vec3 rayCol = vec3(0.22, 0.42, 0.60);
    col += rayCol * light * 0.55;
    // Soft ambient glow around the sun direction so the fan has a root.
    col += vec3(0.10, 0.22, 0.34) * exp(-d * 1.35) * 0.8;

    // Gentle vignette keeps corners quiet under the creature layer.
    float vig = smoothstep(1.35, 0.45, length(uv - vec2(0.5, 0.55)));
    col *= mix(0.72, 1.0, vig);

    col = max(col + uwDither(), vec3(0.0196));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function HeroUwGodRays({ className }: { className?: string }) {
  return <UnderwaterShader frag={FRAG} className={className} />;
}
