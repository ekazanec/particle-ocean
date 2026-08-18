/*!
 * particle-ocean · https://github.com/ekazanec/particle-ocean
 * Copyright (c) 2026 Andrey Gurov · https://agurov.com
 * MIT licensed. If you ship something built on this, a link back is appreciated.
 */
/**
 * Behavior param helpers — shared by the 18 species modules.
 *
 * Every knob is a MULTIPLIER around 1.0 applied to the species' authored
 * constant (0.3–3 by default): honest (it scales the real term in the real
 * equation), safe (1 = exactly the shipped behavior) and uniform for the
 * lab UI / ocean-hero.json `params` persistence.
 *
 * Convention: keys `speed` / `turn` / `rhythm` exist for (almost) every
 * species with species-appropriate labels; extra keys are species-specific
 * (mouthSpeed, wingAsym, finSpread, …) and live next to the code they drive.
 */
import type { OceanParamDef } from '@/components/motion/ocean/types';

/** Multiplier param around an authored constant (def 1 = shipped look). */
export const mul = (
  key: string,
  label: string,
  desc: string,
  min = 0.3,
  max = 3,
  step = 0.05,
  def = 1,
): OceanParamDef => ({ key, label, desc, min, max, step, def });

/** «Travel speed» — thrust + max-speed multiplier (range-capable). */
export const SPEED: OceanParamDef = { ...mul('speed', 'Travel speed', 'Multiplier on thrust and top speed'), range: true };
/** «Turn rate» — steering gain + angular-velocity-cap multiplier (range-capable). */
export const TURN: OceanParamDef = { ...mul('turn', 'Turn rate', 'How sharply the creature turns toward the cursor'), range: true };
/** Species-flavored rhythm knob (flap / pulse / body-wave frequency). */
export const rhythm = (label: string, desc: string): OceanParamDef => mul('rhythm', label, desc);

/**
 * «Body wave amplitude» — bend-force multiplier for body-wave swimmers:
 * scales the travelling-wave displacement (and the caudal-fin flutter that
 * rides on it), NOT the gait frequency (that's `rhythm`).
 */
export const WAVE_AMP = mul('waveAmp', 'Body wave amplitude', 'Bend force: the higher it goes, the more the body flexes', 0.3, 2.5);

/**
 * Body proportion knobs — every species applies these to its LOCAL particle
 * frame (length = along the travel axis, width = lateral, thickness =
 * dorso-ventral), so the shape stretches with the body, unlike the
 * world-aligned Size/scale.
 */
export const PROPORTIONS: OceanParamDef[] = [
  mul('bodyLen', 'Body length', 'Stretch or squash the body along the travel axis', 0.6, 1.6),
  mul('bodyWide', 'Body width', 'Widen or narrow the body sideways (wingspan, for rays)', 0.6, 1.6),
  mul('bodyThick', 'Body thickness', 'Vertical thickness, back to belly', 0.6, 1.6),
];
export const PROPORTION_KEYS = new Set(PROPORTIONS.map((d) => d.key));

/**
 * Particle appearance knobs — consumed by the HOST (ocean-hero), not the
 * species: size scales the base PointsMaterial size (before body-mode
 * multipliers), hue/sat/bright rewrite the geometry color attribute from a
 * pristine copy kept since build (never per-frame).
 */
export const PARTICLE_SIZE = mul('particleSize', 'Particle size', 'Multiplier on every body point; larger points densify the core instead of inflating the halo', 0.5, 1.8);
/**
 * «Glow» — halo intensity/extent, decoupled from particle size: swaps
 * the sprite falloff texture (see core.ts glow sprite set). 1 = the shipped
 * sprite byte-for-byte; <1 — tight bright core, almost no halo; >1 — broader,
 * brighter halo. No-op in the «Spheres» body mode (spheres have no halo).
 */
export const GLOW = mul('glow', 'Glow', 'Halo intensity around the particles; point size is a separate knob', 0.3, 2);
export const HUE: OceanParamDef = { key: 'hue', label: 'Hue', desc: 'Rotate every creature color around the color wheel', min: -180, max: 180, step: 1, def: 0, unit: 'deg' };
export const SAT = mul('sat', 'Saturation', 'Multiplier on particle color saturation', 0.3, 1.7);
export const BRIGHT = mul('bright', 'Brightness', 'Multiplier on particle brightness', 0.5, 1.6);
export const APPEARANCE: OceanParamDef[] = [PARTICLE_SIZE, GLOW, HUE, SAT, BRIGHT];
export const APPEARANCE_KEYS = new Set(APPEARANCE.map((d) => d.key));

/** Live values object a species reads every frame — pre-filled with defs. */
export function paramDefaults(defs: OceanParamDef[]): Record<string, number> {
  const p: Record<string, number> = {};
  for (const d of defs) p[d.key] = d.def;
  return p;
}
