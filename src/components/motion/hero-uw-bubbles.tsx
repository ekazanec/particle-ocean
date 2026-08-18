/**
 * HeroUwBubbles — «Bubbles»: sparse columns of air bubbles rising from unseen
 * vents — thin ring outlines with a tiny specular glint, wobbling as they
 * climb, size and speed varying per bubble; two parallax depths. Deep-blue
 * night water, nothing arcade — the columns are rare and quiet.
 */
import { UnderwaterShader, UW_GLSL_LIB } from './hero-uw-shader';

const FRAG = /* glsl */ `
${UW_GLSL_LIB}

  // A vertical chain of bubbles in cell space. cell picks column density.
  float bubbleLayer(vec2 p, float cell, float rise, float t, float scale) {
    float col_id = floor(p.x * cell);
    vec2 rnd = hash22(vec2(col_id, cell));
    if (rnd.x < 0.72) return 0.0;         // most columns have no vent
    float colX = (col_id + 0.3 + rnd.y * 0.4) / cell;

    float speed = rise * (0.75 + rnd.y * 0.6);
    float y = p.y - t * speed;
    float seg = floor(y * 3.0);
    vec2 brnd = hash22(vec2(seg, col_id * 7.7));
    if (brnd.x < 0.35) return 0.0;        // gaps in the chain
    float fy = fract(y * 3.0);

    // wobble grows as the bubble ages (rises)
    float wob = sin(p.y * 9.0 + t * (1.2 + brnd.y) + brnd.x * 6.283) * 0.014;
    vec2 c = vec2(colX + wob, (seg + 0.5) / 3.0 + t * speed);
    vec2 d = p - c;
    float r = (0.006 + brnd.y * 0.012) * scale;

    float dist = length(d);
    // thin shell ring
    float ring = smoothstep(r * 1.25, r, dist) - smoothstep(r * 0.82, r * 0.55, dist);
    // specular glint upper-left
    float glint = exp(-dot(d - vec2(-r * 0.35, r * 0.35), d - vec2(-r * 0.35, r * 0.35)) / (r * r * 0.08));
    return clamp(ring, 0.0, 1.0) * 0.8 + glint * 0.5;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    float aspect = uRes.x / uRes.y;
    vec2 p = vec2(uv.x * aspect, uv.y);
    float mx = uMouse.x - 0.5;

    // Deep night-blue column, faint light far above.
    vec3 col = mix(vec3(0.006, 0.011, 0.022), vec3(0.016, 0.038, 0.068), pow(uv.y, 1.5));
    col += vec3(0.02, 0.05, 0.08) * exp(-(1.0 - uv.y) * 2.6) * (0.8 + 0.2 * sin(uTime * 0.1));
    // barely-there drifting murk so the black isn't flat
    col += vec3(0.008, 0.018, 0.028) * fbm3(p * 2.0 + vec2(uTime * 0.02, -uTime * 0.012));

    // far bubbles: small, slow, dimmed by water
    float far = bubbleLayer(p + vec2(mx * 0.04, 0.0), 5.0, 0.045, uTime, 0.8);
    col += vec3(0.10, 0.18, 0.24) * far * 0.5;
    // near bubbles: larger, faster, brighter
    float near = bubbleLayer(p + vec2(mx * 0.12 + 2.63, 0.0), 3.0, 0.085, uTime, 1.6);
    col += vec3(0.20, 0.34, 0.44) * near * 0.7;

    float vig = smoothstep(1.35, 0.45, length(uv - vec2(0.5, 0.5)));
    col *= mix(0.78, 1.0, vig);

    col = max(col + uwDither(), vec3(0.0196));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function HeroUwBubbles({ className }: { className?: string }) {
  return <UnderwaterShader frag={FRAG} className={className} />;
}
