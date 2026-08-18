/*!
 * particle-ocean · https://github.com/ekazanec/particle-ocean
 * Copyright (c) 2026 Andrey Gurov · https://agurov.com
 * MIT licensed. If you ship something built on this, a link back is appreciated.
 */
/**
 * Ocean Hero — typed SSOT config loader.
 *
 * `ocean-hero.json` holds per-animal tuning that isn't code: how deep the
 * creature may roam toward/away from the camera, its visual size, and
 * (optionally) catch radius + camera z-distance — the latter two fall back
 * to the engine defaults in registry.ts (catchR / cam[2]) when absent, so
 * old JSON files keep working unchanged. Same pattern as
 * the old creature-hero config (moved out to the agurov-creatures-legacy
 * repo along with that engine) — see scripts/ocean-config-server.mjs.
 *
 * Dev flow:
 *   1. Open /lab/ocean — pick an animal, drag Depth / Size.
 *   2. Click "Save" — POSTs to :9902 (ocean:config server).
 *   3. The server writes this JSON; Next.js HMR picks up the change.
 *   4. Commit the updated JSON → every consumer (Hero, /lab/ocean) uses it.
 */
import rawCfg from './ocean-hero.json';

export interface OceanAnimalTuning {
  /** Max |z| the creature may roam from the camera-facing origin plane. */
  depthRange: number;
  /** Uniform visual scale multiplier (1 = the engine default size). */
  scale: number;
  /**
   * Catch radius (world units) — distance at which the creature counts as
   * having caught the cursor, triggering the morph. Overrides the registry
   * default (OCEAN_ANIMALS[].catchR) when set.
   */
  catchR?: number;
  /**
   * Camera z-distance for this species. Overrides the registry default
   * (OCEAN_ANIMALS[].cam[2]) when set; x/y stay registry-owned.
   */
  camZ?: number;
  /**
   * Behavior params (key → value) matching the species' params schema in
   * animals/<id>.ts. Only NON-DEFAULT values are stored; unknown keys are
   * ignored at apply time, so schema evolution can't break old configs.
   * Range-capable knobs (speed/turn) may store `[min, max]` — the effective
   * multiplier then wanders smoothly inside the bounds at runtime.
   */
  params?: Record<string, number | [number, number]>;
}

/** Morph choreography ids — must match MorphVariantId in ocean/morph.ts. */
const MORPH_VARIANT_IDS = ['legacy', 'flow', 'pulse', 'vortex'] as const;
export type OceanMorphVariant = (typeof MORPH_VARIANT_IDS)[number];

export interface OceanHeroCfg {
  animals: Record<string, Partial<OceanAnimalTuning>>;
  /** Global morph choreography; unset = 'legacy' (the shipped behavior). */
  morphVariant?: OceanMorphVariant;
}

function parse(raw: unknown): OceanHeroCfg {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const animalsRaw = r.animals && typeof r.animals === 'object' ? r.animals : {};
  const mv = MORPH_VARIANT_IDS.find((v) => v === r.morphVariant);
  return {
    animals: animalsRaw as Record<string, Partial<OceanAnimalTuning>>,
    ...(mv ? { morphVariant: mv } : {}),
  };
}

const oceanHeroCfg: OceanHeroCfg = parse(rawCfg);
export default oceanHeroCfg;
